"""Value formats shared by the importer, forms, views and exports.

Every section field is free text from Excel; typed fields are stored in one canonical form:

    number          "1234" / "12.5"           (see NUMBER_FIELDS on a section model)
    date            "YYYY-MM-DD"              (see DATE_FIELDS)
    monthly profile "2026-11: 40 by 2026-11-20; 2026-12: 48"   (see MONTHLY_PROFILE_FIELD)

Monthly profile: one quantity per calendar month, each with an optional deadline date. Excel
uses one column per month for the quantity ("Nov 2026") and one for its deadline
("Nov 2026 deadline"). An older single-text column is also accepted leniently:

    2026-11: 40; 2026-12: 48          ISO year-month (optionally "... by 2026-11-20")
    Nov-26: 40, Dec-26: 48            month name + 2-digit year
    Nov 2026 = 40 | Dec 2026 = 48     month name + 4-digit year
    Nov: 40, Dec: 48, Jan: 64         no year -> starts from the current month, rolls over at January

Entries may be separated by ; , | or new lines.
"""
import calendar
import datetime as dt
import re

from django.conf import settings
from django.utils import timezone


class Unreadable(ValueError):
    """An Excel cell that does not hold the expected kind of value."""


# ── Numbers and dates ─────────────────────────────────────────────────────────

def number(text):
    """'$1,234.50' / '1 234' / '12' -> '1234.5' / '1234' / '12'; None if not a number."""
    s = re.sub(r"[\s,$€£₹]", "", "" if text is None else str(text))  # note: 0 is a valid number
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return None
    n = float(s)
    return str(int(n)) if n.is_integer() else str(n)


def _qty(text):
    n = float(text)
    return int(n) if n.is_integer() else n


def _valid_date(s):
    try:
        dt.date.fromisoformat(s)
        return True
    except (TypeError, ValueError):
        return False


def cell_qty(value):
    """Quantity cell -> number, None for blank; raises Unreadable for anything else (e.g. "TBD")."""
    if value is None:
        return None
    if isinstance(value, bool):
        raise Unreadable(value)
    if isinstance(value, (int, float)):
        return int(value) if float(value).is_integer() else value
    s = str(value).strip().replace(",", "")
    if not s:
        return None
    try:
        return _qty(s)
    except ValueError:
        raise Unreadable(value) from None


_DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d", "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%b %d %Y", "%B %d %Y")


def cell_date(value):
    """Date cell -> "YYYY-MM-DD", None for blank; raises Unreadable otherwise.

    Accepts Excel dates and unambiguous text (2026-11-20, 20 Nov 2026, Nov 20 2026).
    """
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    s = re.sub(r"\s+", " ", str(value).strip().replace(",", " "))
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    raise Unreadable(value)


def deadline_status(deadline, today=None):
    """How close a deadline is, for the countdown bars.

    -> {"days": int, "level": ok|soon|urgent|overdue, "text": "12 d left" | "Due today" | "3 d overdue"}
    or None when there is no deadline.
    """
    if not deadline:
        return None
    if isinstance(deadline, str):
        deadline = dt.date.fromisoformat(deadline)
    today = today or timezone.localdate()
    days = (deadline - today).days
    level = "overdue" if days < 0 else "urgent" if days <= 7 else "soon" if days <= 30 else "ok"
    text = f"{-days} d overdue" if days < 0 else "Due today" if days == 0 else f"{days} d left"
    return {"days": days, "level": level, "text": text}


# ── Monthly profile text ──────────────────────────────────────────────────────

_MONTHS = {}
for _i in range(1, 13):
    _MONTHS[calendar.month_abbr[_i].lower()] = _i
    _MONTHS[calendar.month_name[_i].lower()] = _i
_MONTHS["sept"] = 9

_NUM = r"(\d+(?:\.\d+)?)"
_BY = r"(?:\s+by\s+(\d{4}-\d{2}-\d{2}))?"
_ISO = re.compile(rf"^(\d{{4}})\s*[-/.]\s*(\d{{1,2}})\s*[:=]?\s*{_NUM}{_BY}$")
_NAMED = re.compile(rf"^([a-z]{{3,9}})\.?(?:[\s\-'/]*(\d{{4}}|\d{{2}}))?\s*[:=]\s*{_NUM}{_BY}$")
_SPLIT = re.compile(r"[;,|\n]+")


def parse_profile(text):
    """-> (list of ("YYYY-MM", qty, "YYYY-MM-DD" | None) in month order, ok).

    ok=False if any entry is unreadable (then the list is empty).
    """
    text = str(text or "").strip()
    if not text:
        return [], True
    today = timezone.localdate()
    items, prev = {}, None  # prev: (year, month) of the last entry, for year inference
    for token in _SPLIT.split(text):
        token = token.strip().lower()
        if not token:
            continue
        m = _ISO.match(token)
        if m:
            year, month, qty, due = int(m[1]), int(m[2]), _qty(m[3]), m[4]
        else:
            m = _NAMED.match(token)
            if not m or m[1] not in _MONTHS:
                return [], False
            month, qty, due = _MONTHS[m[1]], _qty(m[3]), m[4]
            if m[2]:
                year = int(m[2]) + (2000 if len(m[2]) == 2 else 0)
            elif prev is None:
                year = today.year if month >= today.month else today.year + 1
            else:
                year = prev[0] + (1 if month <= prev[1] else 0)
        if not 1 <= month <= 12 or (due and not _valid_date(due)):
            return [], False
        prev = (year, month)
        items[f"{year:04d}-{month:02d}"] = (qty, due)
    return [(ym, q, d) for ym, (q, d) in sorted(items.items())], True


def profile_text(items):
    """[("YYYY-MM", qty, deadline | None), ...] -> canonical text."""
    return "; ".join(f"{ym}: {q}" + (f" by {d}" if d else "") for ym, q, d in items)


def normalize_profile(text):
    """Canonical form if readable, else the original text unchanged. -> (text, ok)"""
    items, ok = parse_profile(text)
    return (profile_text(items), True) if ok else (str(text or "").strip(), False)


def merge_profile(existing_text, updates):
    """Apply per-month column updates to an existing profile. -> (canonical text, orphan_deadlines)

    updates: {"YYYY-MM": {"qty": n | None, "deadline": "YYYY-MM-DD" | None}}; a key is only
    present when the file had that column. qty None removes the month; deadline None clears it.
    A deadline for a month with no quantity is dropped and counted in orphan_deadlines.
    """
    items, ok = parse_profile(existing_text)
    months = {ym: [q, d] for ym, q, d in items} if ok else {}
    orphans = 0
    for ym, u in updates.items():
        if "qty" in u:
            if u["qty"] is None:
                months.pop(ym, None)
            else:
                months.setdefault(ym, [None, None])[0] = u["qty"]
        if "deadline" in u:
            if ym in months:
                months[ym][1] = u["deadline"]
            elif u["deadline"]:
                orphans += 1
    return profile_text([(ym, q, d) for ym, (q, d) in sorted(months.items())]), orphans


# ── Month-per-column Excel layout ─────────────────────────────────────────────
# Each month has a quantity column ("Nov 2026") and a deadline column ("Nov 2026 deadline").
# The template and exports show EDS_MONTHLY_WINDOW_MONTHS months (36 = 3 years) from the
# current month.

def ym_add(ym, n):
    y, m = map(int, ym.split("-"))
    t = y * 12 + (m - 1) + n
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def month_window(extra=()):
    """The month columns to show: the standard window, widened to cover any months in `extra`."""
    today = timezone.localdate()
    first = f"{today.year:04d}-{today.month:02d}"
    last = ym_add(first, settings.EDS_MONTHLY_WINDOW_MONTHS - 1)
    extra = sorted(extra)
    if extra:
        first, last = min(first, extra[0]), max(last, extra[-1])
    out = [first]
    while out[-1] < last:
        out.append(ym_add(out[-1], 1))
    return out


def month_label(ym):
    """"2026-11" -> "Nov 2026" (the quantity column header)."""
    y, m = map(int, ym.split("-"))
    return f"{calendar.month_abbr[m]} {y}"


def deadline_label(ym):
    """"2026-11" -> "Nov 2026 deadline" (the deadline column header)."""
    return f"{month_label(ym)} deadline"


_HDR_ISO = re.compile(r"^(\d{4})\s*[-/.]\s*(\d{1,2})$")
_HDR_NAMED = re.compile(r"^([a-z]{3,9})\.?[\s\-'/]*(\d{4}|\d{2})$")
_HDR_DEADLINE = re.compile(r"^(?:(?:deadline|due)\s*[-:]?\s*(.+)|(.+?)\s*[-:(]?\s*(?:deadline|due(?: date)?)\)?)$")


def parse_month_header(value):
    """Month quantity header -> "YYYY-MM", else None. Accepts Excel dates, "Nov 2026", "Nov-26", "2026-11"."""
    if isinstance(value, (dt.date, dt.datetime)):
        return f"{value.year:04d}-{value.month:02d}"
    s = str(value or "").strip().lower()
    m = _HDR_ISO.match(s)
    if m and 1 <= int(m[2]) <= 12:
        return f"{int(m[1]):04d}-{int(m[2]):02d}"
    m = _HDR_NAMED.match(s)
    if m and m[1] in _MONTHS:
        year = int(m[2]) + (2000 if len(m[2]) == 2 else 0)
        return f"{year:04d}-{_MONTHS[m[1]]:02d}"
    return None


def parse_deadline_header(value):
    """Month deadline header -> "YYYY-MM", else None. "Nov 2026 deadline", "Deadline Nov-26", "2026-11 due"."""
    if isinstance(value, (dt.date, dt.datetime)):
        return None
    m = _HDR_DEADLINE.match(str(value or "").strip().lower())
    return parse_month_header((m[1] or m[2]).strip()) if m else None
