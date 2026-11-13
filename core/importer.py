"""Excel import: one row per demand line, columns matched to topic fields by header text.

* Rows are keyed on **Demand-line ID**: an existing record with that ID is updated,
  otherwise a new EDS record is created (with a freshly generated EDS Record ID).
* System-generated fields (AUTO_FIELDS on the models) are never read from the file; if such a
  column is present it is ignored and reported.
* Only the columns present in the file are written, so partial files are safe.
* Older layouts that held several values in one cell (e.g. "Requested/approved amount")
  are still accepted: see LEGACY_COLUMNS.
"""
import datetime as dt
import re
import uuid
from dataclasses import dataclass, field

import openpyxl
from django.db import transaction
from django.utils import timezone

from . import utils
from .models import Activity
from .topics import get_topics, identity_model

KEY_FIELD = "demand_line_id"
HEADER_SCAN_ROWS = 20   # header row may sit under a title/banner row
MIN_HEADER_MATCHES = 3  # a row needs at least this many known headers to count as the header
BATCH = 500

# Per-row key holding {"YYYY-MM": qty | None} read from month columns (merged on save).
MONTH_UPDATES = "__month_updates__"

def normalize(text):
    """Header match key: case/spacing/dash-insensitive."""
    s = str(text or "").strip().lower()
    s = re.sub(r"[‐-―]", "-", s)
    s = re.sub(r"\s*/\s*", "/", s)
    s = re.sub(r"\s*-\s*", "-", s)
    return re.sub(r"\s+", " ", s)


def to_text(value):
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        return value.date().isoformat() if value.time() == dt.time() else value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


# ── Older Excel layouts: one cell held several values ─────────────────────────
# Each old combined column is split into today's typed fields on the way in. A file that
# also has the new column keeps the new column's value.

_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _first_date(text):
    m = _ISO_DATE.search(text or "")
    return m[0] if m else None


def _slash_parts(text):
    """'a / b / c' -> ['a', 'b', 'c']."""
    text = (text or "").strip()
    return [p.strip() for p in re.split(r"\s*/\s*", text)] if text else []


def _clean(d):
    return {k: v for k, v in d.items() if v not in (None, "")}


_KIND = {"text": lambda s: s, "number": utils.number, "date": _first_date}


def _pair(a, b, kind_a="text", kind_b="text"):
    """Parser for 'A / B' -> {a: A, b: B}, each converted by its kind."""
    def parse(text):
        p = _slash_parts(text)
        return _clean({a: _KIND[kind_a](p[0]) if p else None,
                       b: _KIND[kind_b](" / ".join(p[1:])) if len(p) > 1 else None})
    return parse


def _labelled_dates(*labels):
    """Parser for 'Ship 2026-12-01 | Recv 2027-01-01' -> by label; unlabelled dates fill in order."""
    def parse(text):
        out, t = {}, text or ""
        for pattern, name in labels:
            m = re.search(rf"\b(?:{pattern})\w*\b\s*[:\-]?\s*(\d{{4}}-\d{{2}}-\d{{2}})", t, re.IGNORECASE)
            if m:
                out[name] = m[1]
        if not out:
            out = {name: d for (_, name), d in zip(labels, _ISO_DATE.findall(t))}
        return out
    return parse


def _avl(text):
    """'On AVL / 2026-10-01' -> AVL status (or Qualification status if not about the AVL) + date."""
    status = _ISO_DATE.sub("", text or "").strip(" /-")
    key = "avl_status" if "avl" in status.lower() else "qualification_status"
    return _clean({key: status, "qualification_date": _first_date(text)})


def _switch(text):
    """'ToR x 2' -> role 'ToR', quantity per rack '2'."""
    m = re.match(r"^\s*(.*?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$", text or "", re.IGNORECASE)
    if m:
        return _clean({"switch_role": m[1], "switch_qty_per_rack": utils.number(m[2])})
    return _clean({"switch_role": (text or "").strip()})


def _supplier(text):
    """'Litware Switching - T. Silva' -> owner, contact."""
    parts = re.split(r"\s+[-–]\s+", (text or "").strip(), maxsplit=1)
    if len(parts) == 2:
        return _clean({"supplier_owner": parts[0], "supplier_contact": parts[1]})
    return _pair("supplier_owner", "supplier_contact")(text)


def _price(text):
    """'6850 USD, valid to 2027-04-19' -> price, currency, valid-until date."""
    rest = _ISO_DATE.sub("", text or "")
    cur = re.search(r"\b([A-Z]{3})\b", rest)
    num = re.search(r"[$€£₹]?\s*\d[\d,]*(?:\.\d+)?", rest)
    return _clean({"unit_price": utils.number(num[0]) if num else None,
                   "currency": cur[1] if cur else ("USD" if "$" in rest else None),
                   "price_valid_until": _first_date(text)})


def _commit(text):
    """'36 / 2026-11-29 / c2' -> quantity, date, version."""
    out = {}
    for part in _slash_parts(text):
        if "commit_date" not in out and _first_date(part):
            out["commit_date"] = _first_date(part)
        elif "commit_quantity" not in out and utils.number(part) is not None:
            out["commit_quantity"] = utils.number(part)
        elif part:
            out["commit_version"] = part
    return _clean(out)


def _budget(text):
    """'J. Rao / Finance: M. Chen' -> budget owner, finance owner."""
    p = [re.sub(r"^(budget|finance)\s*:\s*", "", x, flags=re.IGNORECASE) for x in _slash_parts(text)]
    return _clean({"budget_owner": p[0] if p else None, "finance_owner": p[1] if len(p) > 1 else None})


def _risk_qty_value(text):
    """'32 / $588,800' -> requested qty + value;  'rq / aq / rv / av' -> all four."""
    p = [utils.number(x) for x in _slash_parts(text)]
    if len(p) >= 4:
        return _clean({"requested_quantity": p[0], "approved_quantity": p[1],
                       "requested_value": p[2], "approved_value": p[3]})
    return _clean({"requested_quantity": p[0] if p else None, "requested_value": p[1] if len(p) > 1 else None})


def _t2(text):
    """'T2-DL-FAL-0001 / 2026-11-20 / 256' -> key, date, quantity."""
    out = {}
    for part in _slash_parts(text):
        if "t2_forecast_date" not in out and _first_date(part) == part:
            out["t2_forecast_date"] = part
        elif "t2_forecast_quantity" not in out and utils.number(part) is not None and "t2_forecast_key" in out:
            out["t2_forecast_quantity"] = utils.number(part)
        elif "t2_forecast_key" not in out:
            out["t2_forecast_key"] = part
    return _clean(out)


def _po_line(text):
    """'PO-4512345/07' -> PO number, line."""
    t = (text or "").strip()
    if "/" in t:
        po, line = t.rsplit("/", 1)
        return _clean({"po_number": po.strip(), "po_line_number": line.strip()})
    return _clean({"po_number": t})


@dataclass(frozen=True)
class LegacyColumn:
    app: str        # section app label
    header: str     # old Excel header
    fields: tuple   # the fields it fills
    parse: object   # old cell text -> {field: value}


LEGACY_COLUMNS = (
    LegacyColumn("pre_bom", "AVL and qualification status/date",
                 ("avl_status", "qualification_status", "qualification_date"), _avl),
    LegacyColumn("pre_bom", "Switch role and qty/rack", ("switch_role", "switch_qty_per_rack"), _switch),
    LegacyColumn("pre_bom", "Preliminary and final MPN", ("preliminary_mpn", "final_mpn"),
                 _pair("preliminary_mpn", "final_mpn")),
    LegacyColumn("pre_bom", "CPU/OVL generation", ("cpu_generation", "ovl_generation"),
                 _pair("cpu_generation", "ovl_generation")),
    LegacyColumn("demand_destination", "Delivered/open quantity", ("delivered_quantity", "open_quantity"),
                 _pair("delivered_quantity", "open_quantity", "number", "number")),
    LegacyColumn("demand_destination", "Required-at-WWT/SI/site dates",
                 ("required_at_wwt", "required_at_si", "required_at_site"),
                 _labelled_dates(("wwt", "required_at_wwt"), ("si(?!te)", "required_at_si"),
                                 ("site", "required_at_site"))),
    LegacyColumn("commercial_readiness", "Supplier owner/contact", ("supplier_owner", "supplier_contact"), _supplier),
    LegacyColumn("commercial_readiness", "Unit price/currency/validity",
                 ("unit_price", "currency", "price_valid_until"), _price),
    LegacyColumn("commercial_readiness", "Commit quantity/date/version",
                 ("commit_quantity", "commit_date", "commit_version"), _commit),
    LegacyColumn("capex_approval", "Budget and Finance owners", ("budget_owner", "finance_owner"), _budget),
    LegacyColumn("capex_approval", "Approval authority/date", ("approval_authority", "approval_date"),
                 _pair("approval_authority", "approval_date", "text", "date")),
    LegacyColumn("capex_approval", "Requested/approved amount", ("requested_amount", "approved_amount"),
                 _pair("requested_amount", "approved_amount", "number", "number")),
    LegacyColumn("capex_approval", "Requested/approved quantity", ("requested_quantity", "approved_quantity"),
                 _pair("requested_quantity", "approved_quantity", "number", "number")),
    LegacyColumn("risk_buy", "Requested/approved quantity and value",
                 ("requested_quantity", "approved_quantity", "requested_value", "approved_value"), _risk_qty_value),
    LegacyColumn("execution_closure", "PO/line", ("po_number", "po_line_number"), _po_line),
    LegacyColumn("execution_closure", "Shipment/receipt/delivery dates",
                 ("shipment_date", "receipt_date", "delivery_date"),
                 _labelled_dates(("ship", "shipment_date"), ("rec", "receipt_date"), ("deliv", "delivery_date"))),
    LegacyColumn("execution_closure", "T2 forecast key/date/quantity",
                 ("t2_forecast_key", "t2_forecast_date", "t2_forecast_quantity"), _t2),
    LegacyColumn("execution_closure", "Consumed/excess quantity", ("consumed_quantity", "excess_quantity"),
                 _pair("consumed_quantity", "excess_quantity", "number", "number")),
    LegacyColumn("execution_closure", "Closure approver/date", ("closure_approver", "closure_date"),
                 _pair("closure_approver", "closure_date", "text", "date")),
)


@dataclass
class ImportResult:
    file_name: str = ""
    sheet: str = ""
    rows_read: int = 0
    created: int = 0
    updated: int = 0    # existing records where at least one value changed
    unchanged: int = 0  # existing records in the file whose values were all the same already
    skipped: int = 0
    duplicates: int = 0
    matched_columns: int = 0
    expected_columns: int = 0
    unknown_headers: list = field(default_factory=list)
    missing_headers: list = field(default_factory=list)
    auto_headers: list = field(default_factory=list)  # generated columns found in the file (ignored)
    bad_monthly: int = 0  # month cells / legacy profiles that could not be read (ignored / kept as text)
    bad_deadlines: int = 0  # deadline cells that were not dates (ignored)
    orphan_deadlines: int = 0  # deadlines given for a month without a quantity (ignored)
    bad_dates: int = 0  # date fields (e.g. Required-at-WWT date) that were not dates (ignored)
    bad_numbers: int = 0  # number fields (quantities, prices, amounts) that were not numbers (ignored)
    legacy_columns: list = field(default_factory=list)  # old combined columns that were split on the way in
    month_columns: int = 0  # one quantity column per month, e.g. "Nov 2026"
    deadline_columns: int = 0  # one deadline column per month, e.g. "Nov 2026 deadline"


def input_lookup():
    """normalized header -> (topic, field_name), for columns accepted from the file."""
    return {normalize(h): (t, n) for t in get_topics() for n, h in t.input_fields}


def auto_lookup():
    """normalized header -> header, for system-generated columns."""
    return {normalize(h): h for t in get_topics() for n, h in t.fields if n in t.auto_fields}


def _find_header(wb, lookup):
    for ws in wb.worksheets:
        for idx, row in enumerate(ws.iter_rows(max_row=HEADER_SCAN_ROWS, values_only=True), start=1):
            if sum(1 for c in row if normalize(c) in lookup) >= MIN_HEADER_MATCHES:
                return ws, idx, row
    return None, None, None


@dataclass
class ParsedFile:
    """One workbook read into memory: rows[demand_line_id][topic_label] = {field: value}."""
    name: str
    rows: dict
    result: ImportResult


def import_workbook(fileobj, name=""):
    """Read and save one workbook (single-file import). -> ImportResult"""
    batch = run_batch([parse_workbook(fileobj, name)], commit=True)
    result = batch.files[0].result
    result.orphan_deadlines = batch.orphan_deadlines
    return result


def parse_workbook(fileobj, name=""):
    """Read one workbook without touching the database. -> ParsedFile; ValueError if unreadable."""
    lookup, generated = input_lookup(), auto_lookup()
    key_header = next(h for t in get_topics() for n, h in t.input_fields if n == KEY_FIELD)

    wb = openpyxl.load_workbook(fileobj, read_only=True, data_only=True)
    try:
        ws, header_row, headers = _find_header(wb, lookup)
        if ws is None:
            raise ValueError(f"No EDS header row found in the first {HEADER_SCAN_ROWS} rows of any sheet.")

        result = ImportResult(file_name=name, sheet=ws.title, expected_columns=len(lookup))
        colmap = {}      # col index -> (topic, field)
        month_cols = {}     # col index -> "YYYY-MM" (quantity)
        deadline_cols = {}  # col index -> "YYYY-MM" (deadline date)
        legacy_cols = {}    # col index -> LegacyColumn (old combined column, split on the way in)
        legacy_lookup = {normalize(lc.header): lc for lc in LEGACY_COLUMNS}
        for i, h in enumerate(headers):
            if h is None or str(h).strip() == "":
                continue
            key = normalize(h)
            hit = lookup.get(key)
            ym = None if hit else utils.parse_month_header(h)
            due_ym = None if hit or ym else utils.parse_deadline_header(h)
            if hit and hit not in colmap.values():
                colmap[i] = hit
            elif key in legacy_lookup and legacy_lookup[key] not in legacy_cols.values():
                legacy_cols[i] = legacy_lookup[key]
                result.legacy_columns.append(str(h).strip())
            elif ym and ym not in month_cols.values():
                month_cols[i] = ym
            elif due_ym and due_ym not in deadline_cols.values():
                deadline_cols[i] = due_ym
            elif key in generated:
                result.auto_headers.append(str(h).strip())
            else:
                result.unknown_headers.append(str(h).strip())
        result.matched_columns = len(colmap)
        result.month_columns = len(month_cols)
        result.deadline_columns = len(deadline_cols)
        monthly_topic = next((t for t in get_topics() if t.monthly_field), None)
        found = {(t.label, n) for t, n in colmap.values()}
        for sp in legacy_cols.values():  # an old combined column stands in for its split fields
            new = {(sp.app, n) for n in sp.fields} - found
            found |= new
            result.matched_columns += len(new)
        if (month_cols or deadline_cols) and monthly_topic:  # month columns stand in for "Monthly profile"
            found.add((monthly_topic.label, monthly_topic.monthly_field))
            result.matched_columns += 1
        result.missing_headers = [h for t in get_topics() for n, h in t.input_fields
                                  if (t.label, n) not in found]

        key_col = next((i for i, (t, n) in colmap.items() if n == KEY_FIELD), None)
        if key_col is None:
            raise ValueError(f'The "{key_header}" column is required: rows are matched on it.')

        # rows[demand_line_id][topic_label] = {field: value}; last occurrence wins
        rows = {}
        for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
            if not row or all(c is None or str(c).strip() == "" for c in row):
                continue
            result.rows_read += 1
            key = to_text(row[key_col]) if key_col < len(row) else ""
            if not key:
                result.skipped += 1
                continue
            if key in rows:
                result.duplicates += 1
            per_topic = rows.setdefault(key, {})
            for i, (topic, name) in colmap.items():
                raw = row[i] if i < len(row) else None
                if name in topic.date_fields:
                    try:
                        value = utils.cell_date(raw) or ""
                    except utils.Unreadable:
                        result.bad_dates += 1
                        continue  # not a date: leave the stored value as it was
                elif name in topic.number_fields:
                    value = utils.number(raw) if raw not in (None, "") else ""
                    if value is None:
                        result.bad_numbers += 1
                        continue  # not a number: leave the stored value as it was
                else:
                    value = to_text(raw)
                per_topic.setdefault(topic.label, {})[name] = value
            for i, sp in legacy_cols.items():
                old = to_text(row[i]) if i < len(row) else ""
                section = per_topic.setdefault(sp.app, {})
                for name, value in sp.parse(old).items():
                    section.setdefault(name, value)  # explicit split columns win
            if (month_cols or deadline_cols) and monthly_topic:
                updates = {}  # {"YYYY-MM": {"qty": ..., "deadline": ...}} - only columns present in the file
                for i, ym in month_cols.items():
                    try:
                        updates.setdefault(ym, {})["qty"] = utils.cell_qty(row[i] if i < len(row) else None)
                    except utils.Unreadable:
                        result.bad_monthly += 1  # leave that month as it was
                for i, ym in deadline_cols.items():
                    try:
                        updates.setdefault(ym, {})["deadline"] = utils.cell_date(row[i] if i < len(row) else None)
                    except utils.Unreadable:
                        result.bad_deadlines += 1  # leave that deadline as it was
                per_topic.setdefault(monthly_topic.label, {})[MONTH_UPDATES] = updates
    finally:
        wb.close()

    # Legacy single "Monthly profile" text column -> canonical "YYYY-MM: qty; ..." form
    monthly_fields = {(t.label, t.monthly_field) for t in get_topics() if t.monthly_field}
    for per_topic in rows.values():
        for label, name in monthly_fields:
            values = per_topic.get(label, {})
            if values.get(name) and MONTH_UPDATES not in values:
                values[name], ok = utils.normalize_profile(values[name])
                result.bad_monthly += not ok

    return ParsedFile(name=result.file_name, rows=rows, result=result)


# ── Multi-file batches ────────────────────────────────────────────────────────

@dataclass
class Conflict:
    """Two files in one batch gave different values for the same demand line and column."""
    key: str
    column: str
    earlier_file: str
    earlier_value: str
    later_file: str
    later_value: str  # the value that is kept (later file wins)


@dataclass
class BatchResult:
    files: list = field(default_factory=list)      # ParsedFile, in the order they were applied
    rejected: list = field(default_factory=list)   # (file name, reason): unreadable, blocks the batch
    ignored: list = field(default_factory=list)    # (file name, reason): lock files, duplicates, ...
    conflicts: list = field(default_factory=list)  # Conflict
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    orphan_deadlines: int = 0  # deadlines for a month with no quantity (ignored)
    batch_id: str = ""           # set when the batch is saved; shared by its UploadLog rows
    activity: object = None      # the change-history Activity, when saved
    created_keys: set = field(default_factory=set)
    updated_keys: set = field(default_factory=set)

    @property
    def ok(self):
        return bool(self.files) and not self.rejected


def _column_names():
    """(topic label, field) -> Excel header, for conflict messages."""
    return {(t.label, n): h for t in get_topics() for n, h in t.fields}


def _show(value):
    return "(blank)" if value in (None, "") else str(value)


def merge_files(files):
    """Merge ParsedFiles in order (later file wins) -> (rows, [Conflict]).

    Files that fill different columns for the same demand line simply combine. A conflict
    is a column that two files both give with different values; the later value is kept.
    """
    headers = _column_names()
    rows, seen, conflicts = {}, {}, []  # seen[(key, label, slot)] = (file name, value)

    def note(key, label, slot, value, column, fname):
        prev = seen.get((key, label, slot))
        if prev is not None and prev[1] != value:
            conflicts.append(Conflict(key, column, prev[0], _show(prev[1]), fname, _show(value)))
        seen[(key, label, slot)] = (fname, value)

    for pf in files:
        for key, per_topic in pf.rows.items():
            dst = rows.setdefault(key, {})
            for label, values in per_topic.items():
                d = dst.setdefault(label, {})
                for name, value in values.items():
                    if name == MONTH_UPDATES:  # merge month by month
                        mu = d.setdefault(MONTH_UPDATES, {})
                        for ym, parts in value.items():
                            slot = mu.setdefault(ym, {})
                            for part, v in parts.items():
                                column = utils.month_label(ym) if part == "qty" else utils.deadline_label(ym)
                                note(key, label, ("month", ym, part), v, column, pf.name)
                                slot[part] = v
                        continue
                    note(key, label, name, value, headers.get((label, name), name), pf.name)
                    d[name] = value
    return rows, conflicts


def run_batch(files, commit, user=None):
    """Merge files in order and save them in one transaction. commit=False: dry run, rolled back.

    A saved batch also records its field changes in the change history (as `user`).
    -> BatchResult with exact created / updated / unchanged counts (also for a dry run).
    """
    batch = BatchResult(files=list(files))
    rows, batch.conflicts = merge_files(batch.files)
    with transaction.atomic():
        created, updated, unchanged, batch.orphan_deadlines, changes = _save(rows)
        if commit:
            batch.batch_id = uuid.uuid4().hex
            names = [pf.name for pf in batch.files]
            n = len(names)
            batch.activity = Activity.add(
                Activity.IMPORT, user,
                f"Imported {n} file{'s' if n != 1 else ''}: {len(created)} new, {len(updated)} updated, "
                f"{len(unchanged)} unchanged",
                changes, records=len(created) + len(updated),
                details={"files": names, "batch": batch.batch_id, "created": len(created),
                         "updated": len(updated), "unchanged": len(unchanged), "conflicts": len(batch.conflicts)},
            )
        else:
            transaction.set_rollback(True)
    batch.created_keys, batch.updated_keys = created, updated
    batch.created, batch.updated, batch.unchanged = len(created), len(updated), len(unchanged)
    for pf in batch.files:
        keys = set(pf.rows)
        pf.result.created = len(keys & created)
        pf.result.updated = len(keys & updated)
        pf.result.unchanged = len(keys & unchanged)
    return batch


@transaction.atomic
def _save(rows):
    """Write merged rows. -> (created keys, updated keys, unchanged keys, orphan deadlines, changes).

    changes: (record, section label, field, old, new, record is new) for the change history.

    Only values that differ from what is stored count as a change; Refreshed / Review dates
    move only for records where something actually changed.
    """
    Record = identity_model()
    topics = get_topics()
    now = timezone.now()
    today = timezone.localdate()

    existing = {}
    for rec in Record.objects.filter(**{f"{KEY_FIELD}__in": list(rows)}).order_by("seq"):
        existing.setdefault(getattr(rec, KEY_FIELD), rec)

    created_keys, changed_keys = set(), set()
    orphans = 0
    pending = []  # (key, section label, field, old, new): resolved to records once they exist

    # 1) identity rows: create with generated fields, or update only the fields that differ
    new, changed, touched = [], [], set()
    seq = Record.next_seq()
    for key, per_topic in rows.items():
        values = per_topic.get("record_identity", {})
        rec = existing.get(key)
        if rec is None:
            rec = Record(**Record.generated_fields(seq), **values)
            pending += [(key, "record_identity", k, "", v) for k, v in values.items()]
            for k, v in Record.lifecycle_dates(today, today).items():
                setattr(rec, k, v)
            new.append(rec)
            created_keys.add(key)
            seq += 1
            continue
        diff = {k: v for k, v in values.items() if getattr(rec, k) != v}
        if diff:
            pending += [(key, "record_identity", k, getattr(rec, k), v) for k, v in diff.items()]
            for k, v in diff.items():
                setattr(rec, k, v)
            touched.update(diff)
            changed.append(rec)
            changed_keys.add(key)
    Record.objects.bulk_create(new, batch_size=BATCH)
    if changed:
        Record.objects.bulk_update(changed, sorted(touched), batch_size=BATCH)

    recs = {}
    for rec in Record.objects.filter(**{f"{KEY_FIELD}__in": list(rows)}).order_by("seq"):
        recs.setdefault(getattr(rec, KEY_FIELD), rec)

    # 2) one section row per topic app
    for topic in topics:
        if topic.is_identity:
            continue
        Section = topic.model
        generates = bool(topic.auto_fields)  # e.g. Pre-BOM IDs
        have = {s.record_id: s for s in Section.objects.filter(record__in=recs.values())}
        to_create, to_update, fields = [], [], set()
        for key, per_topic in rows.items():
            values = dict(per_topic.get(topic.label, {}))
            rec = recs[key]
            sec = have.get(rec.pk)
            if MONTH_UPDATES in values:  # month columns win over a legacy text column
                updates = values.pop(MONTH_UPDATES)
                values[topic.monthly_field], n = utils.merge_profile(
                    getattr(sec, topic.monthly_field) if sec else "", updates)
                orphans += n
            # topics with generated fields always get a row, so those IDs exist
            if not values and not generates:
                continue
            if sec is None:
                if not generates and not any(values.values()):
                    continue  # nothing to store for this topic yet
                to_create.append(Section(record=rec, **Section.generated_fields(rec.seq), **values))
                pending += [(key, topic.label, k, "", v) for k, v in values.items()]
                if any(values.values()):
                    changed_keys.add(key)
                continue
            diff = {k: v for k, v in values.items() if getattr(sec, k) != v}
            backfill = {}  # generated IDs that are somehow blank (not a user change)
            if generates:
                backfill = {k: v for k, v in Section.generated_fields(rec.seq).items() if not getattr(sec, k)}
            if not diff and not backfill:
                continue
            pending += [(key, topic.label, k, getattr(sec, k), v) for k, v in diff.items()]
            for k, v in {**diff, **backfill}.items():
                setattr(sec, k, v)
            fields.update(diff, backfill)
            sec.updated_at = now
            to_update.append(sec)
            if diff:
                changed_keys.add(key)
        Section.objects.bulk_create(to_create, batch_size=BATCH)
        if to_update and fields:
            Section.objects.bulk_update(to_update, sorted(fields) + ["updated_at"], batch_size=BATCH)

    # 3) refresh dates only where something changed
    changed_keys -= created_keys
    if changed_keys:
        dates = Record.lifecycle_dates(today, today)
        Record.objects.filter(pk__in=[recs[k].pk for k in changed_keys]).update(
            refreshed_date=dates["refreshed_date"], review_date=dates["review_date"], updated_at=now)
    unchanged_keys = set(rows) - created_keys - changed_keys
    changes = [(recs[key], label, name, old, new, key in created_keys) for key, label, name, old, new in pending]
    return created_keys, changed_keys, unchanged_keys, orphans, changes
