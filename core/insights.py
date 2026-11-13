"""Info cards above each section's table: a few figures that summarise that section's columns.

Every value in the section models is free text (it comes from Excel), so numbers and dates are
parsed leniently: "$380,800" -> 380800, "12 wks" -> 12, "2026-12-04" -> date. Unparseable values
are skipped. Each section has one builder below, registered in ``BUILDERS`` by app label.
"""
import datetime as dt
import re
from collections import Counter

from django.utils import timezone

_NUM = re.compile(r"-?\d+(?:\.\d+)?")


# ── parsing / formatting helpers ──────────────────────────────────────────────
def num(v):
    m = _NUM.match(str(v or "").replace(",", "").replace("$", "").strip())
    return float(m.group()) if m else None


def day(v):
    try:
        return dt.date.fromisoformat(str(v or "").strip()[:10])
    except ValueError:
        return None


def norm(v):
    return str(v or "").strip().lower()


def total(rows, field):
    return sum(n for r in rows if (n := num(r[field])) is not None)


def filled(rows, field):
    return [r for r in rows if str(r[field] or "").strip()]


def count(rows, field, *values):
    want = {v.lower() for v in values}
    return sum(1 for r in rows if norm(r[field]) in want)


def pct(part, whole):
    return round(100 * part / whole) if whole else None


def qty(n):
    return f"{n:,.0f}" if float(n).is_integer() else f"{n:,.1f}"


def money(n):
    if abs(n) >= 1_000_000:
        return f"${n / 1_000_000:,.1f}M"
    if abs(n) >= 10_000:
        return f"${n / 1_000:,.0f}K"
    return f"${n:,.0f}"


def short_date(d):
    return f"{d.day} {d:%b %y}"


def plural(n, word, many=None):
    return f"{qty(n)} {word if n == 1 else (many or word + 's')}"


def join(*parts):
    return " · ".join(p for p in parts if p)


def card(label, value, *, icon="", of=None, meter=None, tone=None, sub="", segments=None):
    """meter: 0-100 share shown as a bar (and as '%'); segments: [(label, count, css)] stacked bar."""
    segs = [{"label": l, "count": c, "cls": cls} for l, c, cls in (segments or []) if c]
    return {
        "label": label, "value": value, "icon": icon, "of": of, "tone": tone, "sub": sub,
        "pct": meter, "meter": None if meter is None else max(0, min(100, meter)),
        "segments": segs,
    }


def mix(rows, field, order):
    """Stacked-bar segments in a fixed order: order = [(value, label, css)]; anything else = 'Other'."""
    counts = Counter(norm(r[field]) for r in rows)
    segs = [(label, counts.pop(value.lower(), 0), cls) for value, label, cls in order]
    blank = counts.pop("", 0)
    if counts:
        segs.append(("Other", sum(counts.values()), "muted"))
    if blank:
        segs.append(("Not set", blank, "muted"))
    return segs


def upcoming(rows, field, today, within):
    """(overdue, due within N days, next upcoming date) for a date column."""
    dates = [d for r in rows if (d := day(r[field]))]
    overdue = sum(1 for d in dates if d < today)
    soon = sum(1 for d in dates if today <= d <= today + dt.timedelta(days=within))
    nxt = min((d for d in dates if d >= today), default=None)
    return overdue, soon, nxt


# ── one builder per section ───────────────────────────────────────────────────
def record_identity(rows, today):
    n = len(rows)
    programs = len({r["program"] for r in rows if r["program"]})
    lines = len(filled(rows, "demand_line_id"))
    phases = mix(rows, "program_phase", [("Concept", "Concept", "a4"), ("Plan", "Plan", "a3"),
                                         ("Build", "Build", "a2"), ("Ramp", "Ramp", "a1")])
    late = count(rows, "program_phase", "build", "ramp")
    overdue, soon, nxt = upcoming(rows, "review_date", today, 14)
    sources = Counter(r["source_signal"] for r in rows if r["source_signal"])
    top, top_n = sources.most_common(1)[0] if sources else ("—", 0)
    return [
        card("EDS records", qty(n), icon="bi-collection",
             sub=join(plural(programs, "program"), plural(lines, "demand line"))),
        card("In build or ramp", qty(late), of=qty(n), icon="bi-diagram-3", segments=phases),
        card("Reviews due", qty(overdue + soon), icon="bi-calendar-check",
             tone="bad" if overdue else ("warn" if soon else "ok"),
             sub=join(f"{qty(overdue)} overdue" if overdue else "",
                      f"next {short_date(nxt)}" if nxt else "none scheduled", "within 14 days")),
        card("Main source signal", f"{pct(top_n, n) or 0}%", icon="bi-broadcast",
             sub=join(top, plural(len(sources), "source"))),
    ]


def pre_bom(rows, today):
    n = len(rows)
    yes, cond, no = (count(rows, "engineering_green_light", v) for v in ("yes", "conditional", "no"))
    avl = count(rows, "avl_status", "on avl")
    in_qual, pending = count(rows, "qualification_status", "in qual"), count(rows, "qualification_status", "pending")
    mature = count(rows, "ppa_bom_milestone", "bom v1.0", "ppa locked")
    high, low = count(rows, "confidence", "high"), count(rows, "confidence", "low")
    return [
        card("Engineering green-light", qty(yes), of=qty(n), meter=pct(yes, n), tone="ok", icon="bi-check2-square",
             sub=join(f"{qty(cond)} conditional", f"{qty(no)} no")),
        card("On AVL", qty(avl), of=qty(n), meter=pct(avl, n), icon="bi-patch-check",
             sub=join(f"{qty(in_qual)} in qualification", f"{qty(pending)} pending")),
        card("BOM v1.0 or PPA locked", qty(mature), of=qty(n), icon="bi-diagram-2",
             segments=mix(rows, "ppa_bom_milestone", [("Pre-PPA", "Pre-PPA", "a4"), ("BOM v0.9", "v0.9", "a3"),
                                                      ("BOM v1.0", "v1.0", "a2"), ("PPA locked", "PPA locked", "a1")])),
        card("High confidence", qty(high), of=qty(n), icon="bi-speedometer2", tone="bad" if low > n / 2 else None,
             segments=mix(rows, "confidence", [("Low", "Low", "bad"), ("Medium", "Medium", "warn"), ("High", "High", "ok")])),
    ]


def demand_destination(rows, today):
    n = len(rows)
    demand = total(rows, "total_expected_demand")
    # CapEx approval is summarised on the Capex Approval tab (its own Status / Approved quantity),
    # so this tab sticks to demand and supply: committed, on PO, delivered.
    committed, po = total(rows, "supplier_committed_quantity"), total(rows, "po_quantity")
    delivered, open_q = total(rows, "delivered_quantity"), total(rows, "open_quantity")
    conflicts = sum(1 for r in rows if norm(r["allocation_conflict"]) not in ("", "none", "no"))
    p0 = count(rows, "priority", "p0")
    overdue, soon, nxt = upcoming(rows, "required_at_site", today, 30)
    return [
        card("Total expected demand", qty(demand), icon="bi-bar-chart-line",
             sub=join(plural(n, "line"), f"{qty(p0)} P0")),
        card("Supplier-committed", qty(committed), of=qty(demand), meter=pct(committed, demand), icon="bi-hand-thumbs-up",
             sub=join(f"{qty(po)} on PO", f"{qty(demand - committed)} not yet committed" if demand > committed else "")),
        card("Delivered", qty(delivered), of=qty(demand), meter=pct(delivered, demand), icon="bi-box-seam",
             sub=f"{qty(open_q)} open"),
        card("Allocation conflicts", qty(conflicts), icon="bi-sign-intersection",
             tone="warn" if conflicts else "ok",
             sub="lines sharing allocation" if conflicts else "No shared allocations"),
        card("Next required-at-site", short_date(nxt) if nxt else "—", icon="bi-geo-alt",
             tone="bad" if overdue else None,
             sub=join(f"{qty(overdue)} past due" if overdue else "", f"{qty(soon)} due in 30 days")),
    ]


def commercial_readiness(rows, today):
    n = len(rows)
    ctb = count(rows, "clear_to_build_status", "ctb", "clear to build")
    shorts = Counter(r["clear_to_build_status"].split("-", 1)[-1].strip()
                     for r in rows if r["clear_to_build_status"] and norm(r["clear_to_build_status"]) not in ("ctb", "clear to build"))
    green, amber, red = (count(rows, "supply_health", v) for v in ("green", "amber", "red"))
    committed = total(rows, "commit_quantity")
    commit_lines = sum(1 for r in rows if (num(r["commit_quantity"]) or 0) > 0)
    expired, expiring, nxt = upcoming(rows, "price_valid_until", today, 60)
    weeks = [w for r in rows if (w := num(r["lead_time"])) is not None]
    return [
        card("Clear to build", qty(ctb), of=qty(n), meter=pct(ctb, n), tone="ok", icon="bi-hammer",
             sub=join(*(f"{qty(c)} short {what}" for what, c in shorts.most_common(2))) or "No shortages"),
        card("Supply health green", qty(green), of=qty(n), icon="bi-heart-pulse", tone="bad" if red else None,
             segments=[("Red", red, "bad"), ("Amber", amber, "warn"), ("Green", green, "ok")]),
        card("Committed quantity", qty(committed), icon="bi-hand-thumbs-up",
             sub=join(f"on {plural(commit_lines, 'line')}", f"{qty(total(rows, 'reserved_allocation'))} reserved")),
        card("Prices expiring", qty(expired + expiring), icon="bi-tag", tone="bad" if expired else ("warn" if expiring else "ok"),
             sub=join(f"{qty(expired)} expired" if expired else "", "within 60 days",
                      f"next {short_date(nxt)}" if nxt else "")),
        card("Average lead time", f"{sum(weeks) / len(weeks):.0f} wks" if weeks else "—", icon="bi-hourglass-split",
             sub=f"longest {max(weeks):.0f} wks" if weeks else ""),
    ]


def capex_approval(rows, today):
    n = len(rows)
    req_amt, appr_amt = total(rows, "requested_amount"), total(rows, "approved_amount")
    req_q, appr_q = total(rows, "requested_quantity"), total(rows, "approved_quantity")
    approved = count(rows, "status", "approved")
    unfunded = total(rows, "remaining_unfunded_demand")
    unfunded_lines = sum(1 for r in rows if (num(r["remaining_unfunded_demand"]) or 0) > 0)
    return [
        card("Approved amount", money(appr_amt), of=money(req_amt), meter=pct(appr_amt, req_amt), icon="bi-cash-stack",
             sub=f"{money(req_amt - appr_amt)} still to approve" if req_amt > appr_amt else "All requested approved"),
        card("Approved quantity", qty(appr_q), of=qty(req_q), meter=pct(appr_q, req_q), icon="bi-boxes",
             sub=f"{qty(req_q - appr_q)} units pending" if req_q > appr_q else "All requested approved"),
        card("Requests approved", qty(approved), of=qty(n), icon="bi-clipboard-check",
             segments=mix(rows, "status", [("Draft", "Draft", "muted"), ("Submitted", "Submitted", "warn"),
                                           ("Approved", "Approved", "ok"), ("Rejected", "Rejected", "bad")])),
        card("Unfunded demand", qty(unfunded), icon="bi-exclamation-diamond", tone="warn" if unfunded else "ok",
             sub=f"units on {plural(unfunded_lines, 'line')}" if unfunded else "Everything funded"),
    ]


def risk_buy(rows, today):
    n = len(rows)
    active = [r for r in rows if r["risk_type"] or r["requested_quantity"] or r["ado_work_item_id"]]
    types = Counter(r["risk_type"] for r in active if r["risk_type"])
    open_rows = [r for r in active if norm(r["decision_closure_status"]) == "open"]
    overdue, soon, nxt = upcoming(open_rows, "decision_required_date", today, 14)
    req_v, appr_v = total(active, "requested_value"), total(active, "approved_value")
    no_stock = sum(1 for r in active if "no stock" in norm(r["inventory_netting"]))
    return [
        card("Active risk buys", qty(len(active)), of=qty(n), icon="bi-exclamation-triangle",
             sub=join(*(f"{qty(c)} {t}" for t, c in types.most_common(3)))),
        card("Open decisions", qty(len(open_rows)), icon="bi-hourglass", tone="bad" if overdue else ("warn" if soon else None),
             sub=join(f"{qty(overdue)} overdue" if overdue else "", f"{qty(soon)} due in 14 days",
                      f"next {short_date(nxt)}" if nxt else "")),
        card("Approved value", money(appr_v), of=money(req_v), meter=pct(appr_v, req_v), icon="bi-currency-dollar",
             sub=f"{money(req_v - appr_v)} not approved" if req_v > appr_v else "All requested approved"),
        card("NCNR exposure", money(total(active, "ncnr_amount")), icon="bi-shield-exclamation", tone="warn",
             sub=f"{qty(no_stock)} with no stock to net" if no_stock else "All netted against stock"),
    ]


def execution_closure(rows, today):
    n = len(rows)
    orderable = count(rows, "orderable_wwt_enabled_status", "orderable", "wwt-enabled")
    pending = count(rows, "orderable_wwt_enabled_status", "pending setup")
    po = len(filled(rows, "po_number"))
    delivered = len(filled(rows, "delivery_date"))
    closed = len(filled(rows, "closure_date"))
    realloc = len(filled(rows, "reallocation_disposition"))
    return [
        card("Orderable / WWT-enabled", qty(orderable), of=qty(n), meter=pct(orderable, n), icon="bi-cart-check",
             sub=f"{qty(pending)} pending setup" if pending else "All set up"),
        card("PO placed", qty(po), of=qty(n), meter=pct(po, n), icon="bi-receipt",
             sub=f"{qty(len(filled(rows, 'shipment_date')))} shipped"),
        card("Delivered", qty(delivered), of=qty(n), meter=pct(delivered, n), icon="bi-truck",
             sub=join(f"{qty(total(rows, 'consumed_quantity'))} consumed", f"{qty(total(rows, 'excess_quantity'))} excess")),
        card("Closed", qty(closed), of=qty(n), meter=pct(closed, n), tone="ok", icon="bi-flag",
             sub=f"{qty(realloc)} with a reallocation plan"),
    ]


BUILDERS = {
    "record_identity": record_identity,
    "pre_bom": pre_bom,
    "demand_destination": demand_destination,
    "commercial_readiness": commercial_readiness,
    "capex_approval": capex_approval,
    "risk_buy": risk_buy,
    "execution_closure": execution_closure,
}


def cards_for(topic):
    """Cards for one section, or [] if the section has no builder."""
    build = BUILDERS.get(topic.label)
    if not build:
        return []
    rows = list(topic.model.objects.values())
    return build(rows, timezone.localdate())
