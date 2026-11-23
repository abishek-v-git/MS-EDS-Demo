import datetime as dt
import hashlib
import logging
import re
from io import BytesIO

from django import forms
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.views import LoginView, LogoutView
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.core.paginator import Paginator
from django.db.models import Count, Q, Sum
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme, urlencode
from django.urls import reverse
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from . import insights, utils
from .forms import form_class
from .importer import BatchResult, parse_workbook, run_batch
from .models import Activity, Change, UploadLog
from .topics import CONTEXT_FIELDS, get_groups, get_topic, get_topics, identity_model

log = logging.getLogger(__name__)


def _topic_or_404(app_label):
    try:
        return get_topic(app_label)
    except LookupError:
        raise Http404("Unknown section")


def _columns(topic):
    """(field_name, header, lookup, is_auto) for the table: context columns first, then topic fields."""
    identity = get_topic("record_identity")
    headers = dict(identity.fields)
    cols = [(n, headers[n], n, n in identity.auto_fields) for n in CONTEXT_FIELDS]
    for name, header in topic.fields:
        auto = name in topic.auto_fields
        if topic.is_identity:
            if name not in CONTEXT_FIELDS:
                cols.append((name, header, name, auto))
        else:
            cols.append((name, header, f"{topic.label}__{name}", auto))
    return cols


# How the table shows a column (every field is stored as text). Dates are recognised by value.
STATUS_FIELDS = {
    "current_gate", "avl_status", "qualification_status", "engineering_green_light", "confidence",
    "firmware_sonic_readiness", "priority", "clear_to_build_status", "supply_health", "status",
    "risk_type", "decision_closure_status", "orderable_wwt_enabled_status",
}
PHASE_FIELDS = {"program_phase"}        # stage pills in the section colour (as in the info card)
DUE_FIELDS = {"review_date"}            # red when overdue, amber when due within 14 days
NUMBER_FIELD = re.compile(r"(quantity|amount|value|price|demand)$|^(switch_qty_per_rack|reserved_allocation)$")


def _column_kind(name):
    if name in PHASE_FIELDS:
        return "phase"
    if name in STATUS_FIELDS:
        return "status"
    if name in DUE_FIELDS:
        return "due"
    if NUMBER_FIELD.search(name):
        return "number"
    return ""


def home(request):
    return redirect(get_topics()[0].url)


@require_GET
def workflow_mockup(request):
    """Front-end-only mock-up of the workflow per stakeholder group (sample data in mockup.js)."""
    return render(request, "core/mockup.html")


@require_GET
def workflow_mockup_app(request):
    """Front-end-only mock-up of the whole tool as each group would use it (sample data in mockup_data.js).
    The New record form is the tool's own (record_form), rendered here so the mock-up shows it exactly; it isn't posted."""
    return render(request, "core/mockup_app.html", {"new_record_form": record_form(request).content.decode()})


# ── Sign in / out ─────────────────────────────────────────────────────────────

class SignInForm(AuthenticationForm):
    remember = forms.BooleanField(required=False, initial=True, label="Keep me signed in")


class SignInView(LoginView):
    template_name = "core/login.html"
    form_class = SignInForm
    redirect_authenticated_user = True

    def form_valid(self, form):
        response = super().form_valid(form)
        if not form.cleaned_data.get("remember"):
            self.request.session.set_expiry(0)  # ends when the browser closes
        return response


class SignOutView(LogoutView):
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        messages.info(request, "You've been signed out.")
        return response


@require_GET
def topic_table(request, app_label):
    topic = _topic_or_404(app_label)
    cols = _columns(topic)
    return render(request, "core/topic_table.html", {
        "topic": topic,
        "columns": [{"name": n, "title": h, "auto": a, "expand": n in topic.expandable_fields,
                     "monthly": n in topic.monthly_triggers, "monthly_source": n == topic.monthly_field,
                     "kind": _column_kind(n)}
                    for n, h, _, a in cols],
        "context_count": len(CONTEXT_FIELDS),
        "topic_field_count": len(topic.fields),
        "record_count": identity_model().objects.count(),
        "insight_cards": insights.cards_for(topic),
        "creates_records": creates_records(topic),
        # edit URL with a placeholder pk; JS swaps in the row's pk
        "export_url": reverse(f"{topic.label}:export"),
        "edit_url_tpl": reverse(f"{topic.label}:edit", args=[0]).replace("/0/", "/{pk}/"),
    })


@require_GET
def topic_data(request, app_label):
    topic = _topic_or_404(app_label)
    lookups = [lk for _, _, lk, _ in _columns(topic)] + ["pk"]  # pk is the last, hidden value
    rows = identity_model().objects.order_by("seq").values_list(*lookups)
    return JsonResponse({
        "data": [["" if v is None else v for v in r] for r in rows],
        # info cards are refreshed with the table, so they follow edits without a page reload
        "insights_html": render_to_string("core/_insights.html", {"cards": insights.cards_for(topic)}),
    })


@require_http_methods(["GET", "POST"])
def topic_edit(request, app_label, pk):
    """GET: the edit form (HTML fragment). POST: save; JSON {ok} or {ok: false, html} with errors."""
    topic = _topic_or_404(app_label)
    record = get_object_or_404(identity_model(), pk=pk)
    if topic.is_identity:
        instance = record
    else:
        instance = topic.model.objects.filter(record=record).first()
        if instance is None:  # topic row not created yet (e.g. column missing from uploads)
            instance = topic.model(record=record, **topic.model.generated_fields(record.seq))

    Form = form_class(topic.label)
    form = Form(request.POST or None, instance=instance)
    before = _values(instance, form)  # validation copies the posted values onto the instance

    if request.method == "POST" and form.is_valid():
        today = timezone.localdate()
        with transaction.atomic():
            form.save()
            changes = _diff(record, topic.label, instance, before)
            if changes:
                Activity.add(Activity.EDIT, request.user, f"Edited {record.eds_record_id} · {topic.title}", changes)
            type(record).objects.filter(pk=record.pk).update(
                **record.lifecycle_dates(timezone.localtime(record.created_at).date(), today),
                updated_at=timezone.now(),
            )
        log.info("Edited %s · %s: %s", record.eds_record_id, topic.title, _labels(changes, form))
        return JsonResponse({"ok": True, "message": f"{record.eds_record_id} · {topic.title} saved."})

    auto = [(h, getattr(instance, n, "")) for n, h in topic.fields if n in topic.auto_fields]
    html = render_to_string("core/_edit_form.html", {
        "form": form, "topic": topic, "record": record, "auto": auto,
        "wide": topic.expandable_fields,
        "monthly_field": topic.monthly_field,
    }, request=request)
    if request.method == "POST":
        return JsonResponse({"ok": False, "html": html}, status=400)
    return HttpResponse(html)


def _values(instance, form):
    """The stored text of a form's fields, taken before validation overwrites the instance."""
    return {n: getattr(instance, n, "") or "" for n in form.fields}


def _diff(record, section, instance, before, new_record=False):
    """Fields whose value differs from `before`, as change-history tuples."""
    return [(record, section, n, old, getattr(instance, n, "") or "", new_record)
            for n, old in before.items() if (getattr(instance, n, "") or "") != old]


def _labels(changes, form):
    """Labels of changed fields, for the log: "Priority, Region" or "no changes"."""
    return ", ".join(str(form.fields[c[2]].label) for c in changes) or "no changes"


# The "+ New record" form shows only these groups for now; the other sections are filled in later
# from their own tabs (pencil) or the program view's edit. To show every section again, set to None.
NEW_RECORD_GROUPS = ("Signal Intake",)
# NEW_RECORD_GROUPS = None


def creates_records(topic):
    """True on tabs whose "+ New record" creates an EDS record; the other tabs add their group's
    data to an existing record instead (record picker + that group's sections)."""
    return not NEW_RECORD_GROUPS or topic.group in NEW_RECORD_GROUPS


def _record_forms(record, data=None, group=None):
    """One prefixed ModelForm per topic for a record (new or existing) -> [(topic, instance, form)].
    group: only that tab group's topics (adding one group's data to an existing record)."""
    out = []
    for t in get_topics():
        if group is not None and t.group != group:
            continue
        if record.pk is None and NEW_RECORD_GROUPS and t.group not in NEW_RECORD_GROUPS:
            continue  # not on the new-record form (see NEW_RECORD_GROUPS)
        if t.is_identity:
            inst = record
        else:
            inst = t.model.objects.filter(record=record).first() if record.pk else None
            if inst is None:
                inst = t.model(**(t.model.generated_fields(record.seq) if record.pk else {}))
        out.append((t, inst, form_class(t.label)(data, instance=inst, prefix=t.label)))
    return out


@require_http_methods(["GET", "POST"])
def record_form(request, pk=None):
    """Full record form across all topics. GET: HTML. POST: save all; JSON {ok, pk, program} or {ok: false, html}.

    pk=None creates a new EDS record (generated fields are filled on save); ?program= pre-fills the program.
    ?group=<tab group> (existing records only): just that group's sections, e.g. "Capex Approval".
    """
    Record = identity_model()
    record = get_object_or_404(Record, pk=pk) if pk else Record(program=request.GET.get("program", ""))
    group = request.GET.get("group") if pk else None
    if group is not None and group not in {name for name, _ in get_groups()}:
        raise Http404("Unknown section group")
    parts = _record_forms(record, request.POST if request.method == "POST" else None, group)

    if request.method == "POST":
        before = {t.label: _values(inst, f) for t, inst, f in parts}
        valid = [f.is_valid() for _, _, f in parts]  # validate every form so all errors show
        if all(valid):
            today = timezone.localdate()
            with transaction.atomic():
                creating = record.pk is None
                if creating:
                    for k, v in Record.generated_fields(Record.next_seq()).items():
                        setattr(record, k, v)
                for k, v in Record.lifecycle_dates(
                        today if creating else timezone.localtime(record.created_at).date(), today).items():
                    setattr(record, k, v)
                for t, inst, form in parts:
                    if t.is_identity:
                        form.save()
                        continue
                    obj = form.save(commit=False)
                    obj.record = record
                    if obj.pk is None:
                        if t.auto_fields:
                            for k, v in t.model.generated_fields(record.seq).items():
                                if not getattr(obj, k):
                                    setattr(obj, k, v)
                        elif not any(form.cleaned_data.values()):
                            continue  # nothing entered for this topic
                    obj.save()
                if not any(t.is_identity for t, _, _ in parts):
                    # Record Identity isn't on this form: save the refreshed / review dates directly
                    Record.objects.filter(pk=record.pk).update(
                        **Record.lifecycle_dates(timezone.localtime(record.created_at).date(), today),
                        updated_at=timezone.now(),
                    )
                changes = [c for t, inst, f in parts for c in _diff(record, t.label, inst, before[t.label], creating)]
                if creating or changes:
                    Activity.add(Activity.CREATE if creating else Activity.EDIT, request.user,
                                 f"{'Created' if creating else 'Edited'} {record.eds_record_id}"
                                 + (f" · {group}" if group else ""), changes, records=1)
            changed = [f"{t.title}: {_labels(cs, f)}" for t, _, f in parts
                       for cs in [[c for c in changes if c[1] == t.label]] if cs]
            log.info("%s %s (%s)", "Created" if creating else "Saved", record.eds_record_id,
                     "; ".join(changed) or "no changes")
            return JsonResponse({
                "ok": True, "pk": record.pk, "program": record.program,
                "message": f"{record.eds_record_id} {'created' if creating else 'saved'}.",
            })

    groups = []
    on_form = {t.label: (i, f) for t, i, f in parts}
    for group_name, gtopics in get_groups():
        sections = []
        for t in gtopics:
            if t.label not in on_form:
                continue
            inst, form = on_form[t.label]
            auto = [(h, getattr(inst, n, "") or "") for n, h in t.fields if n in t.auto_fields]
            sections.append({"topic": t, "form": form, "auto": auto})
        if sections:
            groups.append({"name": group_name or gtopics[0].title, "sections": sections})
    html = render_to_string("core/_record_form.html", {
        "record": record,
        "groups": groups,
        "errors": sum(len(f.errors) for _, _, f in parts) if request.method == "POST" else 0,
        "group": group,
        "action": (reverse("record_edit", args=[record.pk]) + (f"?{urlencode({'group': group})}" if group else "")
                   if record.pk else reverse("record_new")),
    }, request=request)
    if request.method == "POST":
        return JsonResponse({"ok": False, "html": html}, status=400)
    return HttpResponse(html)


@require_GET
def record_pick(request):
    """Records to add a tab group's data to: JSON {group, records: [{pk, id, line, program, has_data}]},
    records without any data in that group first."""
    group = request.GET.get("group", "")
    topics = next((ts for name, ts in get_groups() if name == group), None)
    if not group or topics is None:
        raise Http404("Unknown section group")
    filled = set()
    for t in topics:
        inputs = [n for n, _ in t.fields if n not in t.auto_fields]
        if t.is_identity or not inputs:
            continue
        for row in t.model.objects.values_list("record_id", *inputs):
            if any(row[1:]):
                filled.add(row[0])
    rows = identity_model().objects.order_by("seq").values_list("pk", "eds_record_id", "demand_line_id", "program")
    records = [{"pk": pk, "id": eid, "line": line, "program": prog, "has_data": pk in filled}
               for pk, eid, line, prog in rows]
    records.sort(key=lambda r: r["has_data"])  # stable: keeps EDS order within each part
    return JsonResponse({"group": group, "records": records})


def _num(text):
    try:
        return float(str(text).replace(",", "").strip())
    except ValueError:
        return None


def _fmt(n):
    return f"{int(n):,}" if float(n).is_integer() else f"{n:,.2f}"


def _record_view(rec):
    """All data for one record, grouped like the tab strip: [{name, sections: [{topic, fields, ...}]}]."""
    groups = []
    for group_name, gtopics in get_groups():
        sections = []
        for t in gtopics:
            if t.is_identity:
                inst = rec
            else:
                try:
                    inst = getattr(rec, t.label)
                except ObjectDoesNotExist:
                    inst = None
            fields = []
            for n, h in t.fields:
                if t.is_identity and n in CONTEXT_FIELDS:
                    continue  # shown in the record header
                v = (getattr(inst, n, "") if inst else "") or ""
                f = {"label": h, "value": v, "auto": n in t.auto_fields, "kind": "text"}
                if n == t.monthly_field:
                    items, ok = utils.parse_profile(v)
                    f["kind"] = "monthly" if ok and items else "long"
                    if ok and items:
                        f["months"] = [{"label": utils.month_label(ym), "qty": _fmt(q),
                                        "deadline": dt.date.fromisoformat(d) if d else None,
                                        "due": utils.deadline_status(d)} for ym, q, d in items]
                        f["sum"] = _fmt(sum(q for _, q, _ in items))
                elif n in t.expandable_fields:
                    f["kind"] = "long"
                elif v.startswith(("http://", "https://")):
                    f["kind"] = "link"
                fields.append(f)
            sections.append({"topic": t, "fields": fields})
        groups.append({"name": group_name or gtopics[0].title, "sections": sections})
    return {"rec": rec, "groups": groups}


@require_GET
def program_detail(request):
    """Read-only program view: summary + every EDS record of the program with all its data."""
    name = request.GET.get("name", "")
    labels = [t.label for t in get_topics() if not t.is_identity]
    records = list(identity_model().objects.filter(program=name).order_by("seq").select_related(*labels))
    views = [_record_view(r) for r in records]
    selected = request.GET.get("select", "")
    selected_pk = int(selected) if selected.isdigit() and any(r.pk == int(selected) for r in records) else (
        records[0].pk if records else None)

    demand = [_num(getattr(getattr(r, "demand_destination", None), "total_expected_demand", "") or "")
              for r in records if hasattr(r, "demand_destination")]
    demand = [d for d in demand if d is not None]
    regions = sorted({r.demand_destination.region for r in records
                      if hasattr(r, "demand_destination") and r.demand_destination.region})
    phases = sorted({r.program_phase for r in records if r.program_phase})
    return render(request, "core/_program_detail.html", {
        "name": name,
        "views": views,
        "selected_pk": selected_pk,
        "summary": {
            "records": len(records),
            "demand": _fmt(sum(demand)) if demand else "—",
            "phases": ", ".join(phases) or "—",
            "regions": ", ".join(regions) or "—",
        },
    })


SEARCH_VALUE_LIMIT = 60


def _snippet(text, q, width=70):
    """Short excerpt of text around the first (case-insensitive) match of q."""
    text = " ".join(str(text).split())
    i = text.lower().find(q.lower())
    if i < 0 or len(text) <= width:
        return text[:width] + ("…" if len(text) > width else "")
    start = max(0, i - (width - len(q)) // 2)
    end = min(len(text), start + width)
    start = max(0, end - width)
    return ("…" if start else "") + text[start:end] + ("…" if end < len(text) else "")


@require_GET
def master_search(request):
    """Navbar search: column headers and record values across every section.

    JSON {columns: [...], values: [...], more: bool}. Values are one hit per (record, field).
    """
    q = " ".join(request.GET.get("q", "").split())
    if len(q) < 2:
        return JsonResponse({"q": q, "columns": [], "values": [], "more": False})
    ql = q.lower()
    topics = get_topics()

    columns = []
    for t in topics:
        for n, h in t.fields:
            if ql in h.lower():
                columns.append({"topic": t.title, "icon": t.icon, "accent": t.accent,
                                "name": n, "header": h, "url": f"{t.url}?col={n}"})

    values, more = [], False
    for t in topics:
        names = [n for n, _ in t.fields]
        headers = dict(t.fields)
        cond = Q()
        for n in names:
            cond |= Q(**{f"{n}__icontains": q})
        if t.is_identity:
            keys = {"pk": "pk", "rid": "eds_record_id", "prog": "program"}
            qs = t.model.objects.filter(cond).order_by("seq")
        else:
            keys = {"pk": "record_id", "rid": "record__eds_record_id", "prog": "record__program"}
            qs = t.model.objects.filter(cond).order_by("record__seq")
        for row in qs.values(*set(keys.values()) | set(names))[:SEARCH_VALUE_LIMIT]:
            for n in names:
                v = row[n]
                if not v or ql not in str(v).lower():
                    continue
                if len(values) >= SEARCH_VALUE_LIMIT:
                    more = True
                    break
                pk = row[keys["pk"]]
                values.append({
                    "topic": t.title, "icon": t.icon, "accent": t.accent,
                    "header": headers[n], "name": n, "pk": pk,
                    "record": row[keys["rid"]], "program": row[keys["prog"]],
                    "snippet": _snippet(v, q),
                    "url": f"{t.url}?focus={pk}&col={n}",
                })
            if more:
                break
        if more:
            break
    return JsonResponse({"q": q, "columns": columns, "values": values, "more": more})


EXCEL_EXTENSIONS = (".xlsx", ".xlsm")
MAX_CONFLICTS_SHOWN = 50


def _file_notes(r):
    """Cell-level warnings for one imported file (never block the import)."""
    notes = []
    if r.skipped:
        notes.append(f"{r.skipped} row(s) skipped (no Demand-line ID)")
    if r.duplicates:
        notes.append(f"{r.duplicates} duplicate Demand-line ID row(s); last one kept")
    if r.bad_monthly:
        notes.append(f"{r.bad_monthly} monthly profile value(s) were not numbers and were ignored")
    if r.bad_numbers:
        notes.append(f"{r.bad_numbers} number value(s) (quantities, prices, amounts) were not numbers and were ignored")
    if r.legacy_columns:
        notes.append(f"{len(r.legacy_columns)} older combined column(s) were split automatically: "
                     + ", ".join(r.legacy_columns[:4]) + (" …" if len(r.legacy_columns) > 4 else ""))
    if r.bad_dates:
        notes.append(f"{r.bad_dates} date value(s) (e.g. Required-at dates) were not dates and were ignored")
    if r.bad_deadlines:
        notes.append(f"{r.bad_deadlines} monthly deadline(s) were not dates and were ignored")
    if r.auto_headers:
        notes.append(f"{len(r.auto_headers)} system-generated column(s) ignored: {', '.join(r.auto_headers)}")
    if r.missing_headers:
        shown = ", ".join(r.missing_headers[:6]) + (" …" if len(r.missing_headers) > 6 else "")
        notes.append(f"{len(r.missing_headers)} column(s) not in file: {shown}")
    if r.unknown_headers:
        shown = ", ".join(r.unknown_headers[:6]) + (" …" if len(r.unknown_headers) > 6 else "")
        notes.append(f"{len(r.unknown_headers)} unrecognised column(s) ignored: {shown}")
    return notes


def _read_batch(uploaded):
    """Uploaded files -> BatchResult with parsed files (filename order), rejected and ignored files.

    Nothing is written. Excel lock files (~$...), non-Excel files and exact duplicates are ignored;
    a file that cannot be read at all (no header row, no Demand-line ID column, corrupt) is rejected.
    """
    batch = BatchResult()
    seen = {}  # content hash -> first file name
    for f in sorted(uploaded, key=lambda f: f.name.lower()):
        name = f.name
        if name.startswith("~$"):
            batch.ignored.append((name, "Excel lock file (created while a workbook is open)"))
            continue
        if not name.lower().endswith(EXCEL_EXTENSIONS):
            batch.ignored.append((name, "not an .xlsx / .xlsm file"))
            continue
        data = f.read()
        digest = hashlib.sha256(data).hexdigest()
        if digest in seen:
            batch.ignored.append((name, f"same content as {seen[digest]}"))
            continue
        seen[digest] = name
        try:
            batch.files.append(parse_workbook(BytesIO(data), name))
        except ValueError as exc:
            batch.rejected.append((name, str(exc)))
        except Exception as exc:  # corrupt / not really a workbook
            batch.rejected.append((name, f"could not be opened as an Excel workbook ({exc.__class__.__name__})"))
    return batch


@require_POST
def upload(request):
    """Bulk Excel import in two steps, both posting the same files.

    mode=preview: read every file and dry-run the save (rolled back) -> {ok, html, can_import}
    mode=import:  read again, save everything in one transaction -> {ok, redirect}

    All-or-nothing: one unreadable file blocks the whole batch. Cell-level problems and
    conflicts between files are warnings; files are applied in filename order, later file wins.
    """
    back = request.POST.get("next") or "/"
    if not back.startswith("/"):
        back = "/"
    mode = request.POST.get("mode", "preview")
    uploaded = request.FILES.getlist("files")
    limit = settings.EDS_MAX_UPLOAD_FILES
    if not uploaded:
        return JsonResponse({"ok": False, "error": "Choose one or more Excel files to upload."}, status=400)
    if len(uploaded) > limit:
        return JsonResponse({"ok": False, "error": f"Upload at most {limit} files at a time."}, status=400)

    batch = _read_batch(uploaded)
    if batch.ok:
        saved = run_batch(batch.files, commit=(mode == "import"), user=request.user)
        saved.ignored = batch.ignored
        batch = saved
    if mode == "import" and batch.ok:
        return _finish_import(request, batch, back)
    if batch.rejected:
        log.warning("Upload %s blocked: %s", mode,
                    "; ".join(f"{name}: {why}" for name, why in batch.rejected))
    else:
        log.debug("Upload preview: %d file(s), %d new, %d updated", len(batch.files), batch.created, batch.updated)

    # preview, or an import that turned out to be blocked: show what would happen
    html = render_to_string("core/_upload_preview.html", {
        "batch": batch,
        "files": [(pf, _file_notes(pf.result)) for pf in batch.files],
        "conflicts": batch.conflicts[:MAX_CONFLICTS_SHOWN],
        "more_conflicts": max(0, len(batch.conflicts) - MAX_CONFLICTS_SHOWN),
    }, request=request)
    return JsonResponse({"ok": True, "html": html, "can_import": batch.ok})


def _finish_import(request, batch, back):
    """Log each file (one shared batch id) and leave a summary for the next page."""
    batch_id = batch.batch_id
    for pos, pf in enumerate(batch.files, start=1):
        r = pf.result
        UploadLog.objects.create(file_name=pf.name, rows_read=r.rows_read, created=r.created,
                                 updated=r.updated, unchanged=r.unchanged, skipped=r.skipped,
                                 batch=batch_id, batch_position=pos)
    n = len(batch.files)
    log.info("Imported %d file(s) [%s]: %d new, %d updated, %d unchanged, %d conflict(s), batch %s",
             n, ", ".join(pf.name for pf in batch.files), batch.created, batch.updated, batch.unchanged,
             len(batch.conflicts), batch_id)
    messages.success(
        request,
        f"Imported {n} file{'s' if n != 1 else ''}: {batch.created} new, {batch.updated} updated, "
        f"{batch.unchanged} unchanged (review dates kept)."
        if batch.unchanged else
        f"Imported {n} file{'s' if n != 1 else ''}: {batch.created} new, {batch.updated} updated.",
    )
    if batch.conflicts:
        messages.warning(request, f"{len(batch.conflicts)} value(s) differed between files; "
                                  "the later file (by filename) was kept.")
    for pf in batch.files:
        notes = _file_notes(pf.result)
        if notes:
            messages.warning(request, f"{pf.name}: " + " · ".join(notes))
    if batch.orphan_deadlines:
        messages.warning(request, f"{batch.orphan_deadlines} monthly deadline(s) had no quantity "
                                  "for that month and were ignored")
    if batch.ignored:
        messages.info(request, "Ignored: " + " · ".join(f"{name} ({why})" for name, why in batch.ignored))
    return JsonResponse({"ok": True, "redirect": back})


RESET_CONFIRM_WORD = "DELETE"


@require_POST
def reset_data(request):
    """Delete every EDS record (all sections cascade) and the import history. IDs restart at 000001."""
    back = request.POST.get("next", "")
    if not url_has_allowed_host_and_scheme(back, allowed_hosts={request.get_host()}):
        back = reverse("home")
    if request.POST.get("confirm", "").strip() != RESET_CONFIRM_WORD:
        log.info("Clear all data cancelled: confirmation word not typed")
        messages.error(request, f'Nothing was deleted: type {RESET_CONFIRM_WORD} to confirm.')
        return redirect(back)
    Record = identity_model()
    with transaction.atomic():
        records = Record.objects.count()
        Record.objects.all().delete()
        logs, _ = UploadLog.objects.all().delete()
        Activity.add(Activity.RESET, request.user,
                     f"Cleared all data: {records} EDS record{'s' if records != 1 else ''} deleted",
                     records=records, details={"records": records, "upload_logs": logs})
    log.warning("Cleared all data: %d EDS records and %d import log entries deleted", records, logs)
    messages.success(
        request,
        f"All data cleared: {records} EDS record{'s' if records != 1 else ''} and "
        f"{logs} import log entr{'ies' if logs != 1 else 'y'} deleted. New records start again at EDS-000001.",
    )
    return redirect(back)


# ── Change history ────────────────────────────────────────────────────────────

ACTIVITIES_PER_PAGE = 25
RECORDS_PER_LOAD = 20  # records shown per "show more" in an activity's changes
KIND_STYLE = {  # kind -> (icon, tone)
    Activity.IMPORT: ("bi-cloud-arrow-up", "import"),
    Activity.EDIT: ("bi-pencil", "edit"),
    Activity.CREATE: ("bi-plus-lg", "create"),
    Activity.RESET: ("bi-trash3", "reset"),
}


def _history_filters(request):
    g = request.GET
    return {"kind": g.get("kind", ""), "user": g.get("user", ""), "section": g.get("section", ""),
            "q": g.get("q", "").strip()}


def _change_q(f, prefix=""):
    """Q for the Change rows matching the section / search filters (prefix: "items__" from Activity)."""
    q = Q()
    if f["section"]:
        q &= Q(**{f"{prefix}section": f["section"]})
    if f["q"]:
        q &= (Q(**{f"{prefix}eds_record_id__icontains": f["q"]}) | Q(**{f"{prefix}program__icontains": f["q"]})
              | Q(**{f"{prefix}label__icontains": f["q"]}) | Q(**{f"{prefix}old__icontains": f["q"]})
              | Q(**{f"{prefix}new__icontains": f["q"]}))
    return q


@require_GET
def history(request):
    """Every change ever: activities grouped by day, filterable by kind, person, section and text."""
    f = _history_filters(request)
    topics = {t.label: t for t in get_topics()}
    qs = Activity.objects.all()
    if f["kind"]:
        qs = qs.filter(kind=f["kind"])
    if f["user"]:
        qs = qs.filter(username=f["user"])
    narrowed = bool(f["section"] or f["q"])
    if narrowed:
        match = Q(pk__in=Change.objects.filter(_change_q(f)).values("activity_id"))
        if f["q"] and not f["section"]:  # also find imports by file name, edits by summary
            match |= Q(summary__icontains=f["q"]) | Q(details__files__icontains=f["q"])
        qs = qs.filter(match).annotate(matches=Count("items", filter=_change_q(f, "items__")))

    page = Paginator(qs, ACTIVITIES_PER_PAGE).get_page(request.GET.get("page"))
    today = timezone.localdate()
    days = []
    for a in page:
        a.icon, a.tone = KIND_STYLE.get(a.kind, ("bi-dot", "edit"))
        a.section_topics = [topics[s] for s in a.sections if s in topics]
        day = timezone.localtime(a.at).date()
        if not days or days[-1]["date"] != day:
            label = "Today" if day == today else "Yesterday" if day == today - dt.timedelta(days=1) else None
            days.append({"date": day, "label": label, "items": []})
        days[-1]["items"].append(a)

    totals = Activity.objects.aggregate(activities=Count("id"), changes=Sum("change_count"))
    kind_counts = dict(Activity.objects.values_list("kind").annotate(n=Count("id")))
    params = request.GET.copy()
    params.pop("page", None)
    return render(request, "core/history.html", {
        "page": page, "days": days, "filters": f, "narrowed": narrowed,
        "filtered": any(f.values()), "query": params.urlencode(),
        "kinds": [(k, label, kind_counts.get(k, 0), *KIND_STYLE[k]) for k, label in Activity.KINDS],
        "total_activities": totals["activities"] or 0, "total_changes": totals["changes"] or 0,
        "people": sorted({u for u in Activity.objects.values_list("username", flat=True).distinct() if u}),
        "sections": list(topics.values()),
    })


@require_GET
def history_changes(request, pk):
    """One activity's field changes (HTML fragment), grouped by record, then section."""
    activity = get_object_or_404(Activity, pk=pk)
    f = _history_filters(request)
    items = activity.items.filter(_change_q(f))
    try:
        offset = max(0, int(request.GET.get("offset", 0)))
    except ValueError:
        offset = 0
    ids = list(dict.fromkeys(items.order_by("id").values_list("eds_record_id", flat=True)))
    shown = ids[offset:offset + RECORDS_PER_LOAD]
    topics = {t.label: t for t in get_topics()}
    records = {}
    for c in items.filter(eds_record_id__in=shown).order_by("id"):
        r = records.setdefault(c.eds_record_id, {"id": c.eds_record_id, "program": c.program,
                                                 "new": c.new_record, "count": 0, "sections": {}})
        r["count"] += 1
        sec = r["sections"].setdefault(c.section, {"topic": topics.get(c.section), "label": c.section, "changes": []})
        sec["changes"].append(c)
    for r in records.values():
        r["sections"] = list(r["sections"].values())
    more = len(ids) - offset - len(shown)
    return render(request, "core/_history_changes.html", {
        "activity": activity, "records": [records[i] for i in shown if i in records],
        "more": more, "next_offset": offset + len(shown), "total_records": len(ids),
        "query": urlencode({k: v for k, v in f.items() if k in ("section", "q") and v}),
    })


XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
NAVY = "003366"
MONTHS = object()  # marks the monthly-profile slot in a band; expands to one column per month
_NUMBER = re.compile(r"-?(0|[1-9]\d*)(\.\d+)?")
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _tint(hex_colour, amount=0.35):
    """Lighter shade of a colour (used for the monthly-profile band)."""
    h = hex_colour.lstrip("#")
    rgb = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return "".join(f"{round(c + (255 - c) * amount):02X}" for c in rgb)


def _bands(topics, context=False, input_only=False):
    """Column layout for a sheet: [(band_title, colour, [(header, lookup) | (MONTHS, lookup)]), ...].

    The monthly profile is pulled out of its topic into its own band of month columns,
    placed right after that topic's other fields.
    """
    bands = []
    if context:
        headers = dict(get_topic("record_identity").fields)
        bands.append(("Record", NAVY, [(headers[n], n) for n in CONTEXT_FIELDS]))
    for t in topics:
        fields = t.input_fields if input_only else t.fields
        if context and t.is_identity:
            fields = [(n, h) for n, h in fields if n not in CONTEXT_FIELDS]
        prefix = "" if t.is_identity else f"{t.label}__"
        cols = [(h, prefix + n) for n, h in fields if n != t.monthly_field]
        if cols:
            bands.append((t.title, t.accent, cols))
        if t.monthly_field and any(n == t.monthly_field for n, _ in fields):
            bands.append((f"Monthly profile ({t.title})", _tint(t.accent), [(MONTHS, prefix + t.monthly_field)]))
    return bands


def _cell(v):
    """Plain numbers go out as numbers and YYYY-MM-DD as real dates (no 'stored as text' warnings)."""
    if v is None:
        return ""
    if isinstance(v, str) and _NUMBER.fullmatch(v):
        return float(v) if "." in v else int(v)
    if isinstance(v, str) and _ISO_DATE.fullmatch(v):
        try:
            return dt.date.fromisoformat(v)
        except ValueError:
            return v
    return v


def _xlsx_response(bands, filename, queryset=None, sheet_title="EDS"):
    """One sheet: a merged band row (row 1), field headers (row 2), then one row per record.

    A MONTHS slot expands to a quantity + deadline column pair per month.
    """
    flat = [c for _, _, cols in bands for c in cols]
    data = list(queryset.values_list(*[lk for _, lk in flat])) if queryset is not None else []
    month_idx = [i for i, (h, _) in enumerate(flat) if h is MONTHS]
    # profiles[row][col] = {"YYYY-MM": (qty, deadline)}
    profiles = [{i: {ym: (q, d) for ym, q, d in utils.parse_profile(r[i])[0]} for i in month_idx} for r in data]
    months = utils.month_window({ym for p in profiles for d in p.values() for ym in d})

    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title
    white = Font(bold=True, color="FFFFFF")
    col = 1
    for title, colour, cols in bands:
        fill = PatternFill("solid", fgColor=colour.lstrip("#"))
        due_fill = PatternFill("solid", fgColor=_tint(colour, 0.3))
        start = col
        for header, _ in cols:
            if header is MONTHS:
                heads = [(h, kind) for m in months
                         for h, kind in ((utils.month_label(m), "qty"), (utils.deadline_label(m), "due"))]
            else:
                heads = [(header, None)]
            for h, kind in heads:
                c = ws.cell(row=2, column=col, value=h)
                c.font, c.fill = white, (due_fill if kind == "due" else fill)
                c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center" if kind else None)
                width = {"qty": 10, "due": 13}.get(kind) or max(14, min(len(h) + 4, 34))
                ws.column_dimensions[get_column_letter(col)].width = width
                col += 1
        if col - 1 > start:
            ws.merge_cells(start_row=1, start_column=start, end_row=1, end_column=col - 1)
        band = ws.cell(row=1, column=start, value=title)
        band.font, band.fill = white, fill
        band.alignment = Alignment(horizontal="center")
    ws.row_dimensions[2].height = 32

    for r, prof in zip(data, profiles):
        out = []
        for i, v in enumerate(r):
            if i in prof:
                for m in months:
                    q, d = prof[i].get(m, ("", None))
                    out += [q, dt.date.fromisoformat(d) if d else ""]
            else:
                out.append(_cell(v))
        ws.append(out)
        for cell in ws[ws.max_row]:
            if isinstance(cell.value, dt.date):
                cell.number_format = "yyyy-mm-dd"
    ws.freeze_panes = "C3" if data else "B3"

    buf = BytesIO()
    wb.save(buf)
    resp = HttpResponse(buf.getvalue(), content_type=XLSX)
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


def _stamp():
    return timezone.localtime().strftime("%Y%m%d-%H%M")


def _records():
    return identity_model().objects.order_by("seq")


@require_GET
def topic_export(request, app_label):
    """This tab's table: EDS Record ID + Program, then the topic's fields, all records."""
    topic = _topic_or_404(app_label)
    log.info("Exported %s", topic.title)
    return _xlsx_response(_bands([topic], context=True), f"ms-eds_{topic.slug}_{_stamp()}.xlsx",
                          _records(), topic.title[:31])


@require_GET
def export_all(request):
    """Master export: every topic and field (generated ones included), months as columns, all records."""
    log.info("Exported all sections")
    return _xlsx_response(_bands(get_topics()), f"ms-eds_all-sections_{_stamp()}.xlsx", _records())


@require_GET
def download_template(request):
    """Blank input file: input fields only, monthly profile as one column per month for 3 years."""
    return _xlsx_response(_bands(get_topics(), input_only=True), "ms-eds-template.xlsx")
