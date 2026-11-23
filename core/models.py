from django.conf import settings
from django.db import models
from django.utils import timezone


class TopicSection(models.Model):
    """Base for every topic app: one row per EDS record, holding that topic's columns."""

    record = models.OneToOneField(
        "record_identity.EDSRecord",
        on_delete=models.CASCADE,
        related_name="%(app_label)s",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def __str__(self):
        return str(self.record)

    @classmethod
    def generated_fields(cls, seq):
        """Values the system fills in when this section row is first created (see AUTO_FIELDS).

        Sections that generate IDs override this; their row is created for every record.
        """
        return {}


class UploadLog(models.Model):
    """One entry per imported Excel file, shown in the header cards."""

    file_name = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    rows_read = models.PositiveIntegerField(default=0)
    created = models.PositiveIntegerField(default=0)
    updated = models.PositiveIntegerField(default=0)
    skipped = models.PositiveIntegerField(default=0)
    unchanged = models.PositiveIntegerField(default=0)
    # files imported together share a batch id and are listed in apply order
    batch = models.CharField(max_length=32, blank=True, default="", db_index=True)
    batch_position = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.file_name} @ {self.uploaded_at:%Y-%m-%d %H:%M}"


# ── Change history ────────────────────────────────────────────────────────────

class Activity(models.Model):
    """One thing someone did: an import, an edit, a new record or Clear all data.

    Its field-level changes are Change rows. History survives Clear all data: names, record IDs
    and labels are copied, so they still read correctly after the records are gone.
    """

    IMPORT, EDIT, CREATE, RESET, ACTION = "import", "edit", "create", "reset", "action"
    KINDS = [(IMPORT, "Import"), (EDIT, "Edit"), (CREATE, "New record"), (ACTION, "Workflow action"),
             (RESET, "Clear all data")]

    at = models.DateTimeField(default=timezone.now, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name="+")
    username = models.CharField(max_length=150, blank=True, default="")
    kind = models.CharField(max_length=10, choices=KINDS, db_index=True)
    summary = models.CharField(max_length=300)
    details = models.JSONField(default=dict, blank=True)  # e.g. {"files": [...], "batch": "..."}
    record_count = models.PositiveIntegerField(default=0)
    change_count = models.PositiveIntegerField(default=0)
    sections = models.JSONField(default=list, blank=True)  # section labels touched, in tab order

    class Meta:
        ordering = ["-at", "-id"]
        verbose_name_plural = "activities"

    def __str__(self):
        return f"{self.get_kind_display()} by {self.username or 'system'} @ {self.at:%Y-%m-%d %H:%M}"

    @classmethod
    def add(cls, kind, user, summary, changes=(), *, records=None, details=None):
        """Save an activity and its changes. -> Activity

        changes: (record, section label, field name, old, new, new_record) tuples; unchanged
        values are skipped. records: how many records it touched (default: those in changes).
        """
        from .topics import get_topics

        order = {t.label: (t.order, {n: i for i, (n, _) in enumerate(t.fields)}) for t in get_topics()}
        labels = {(t.label, n): h for t in get_topics() for n, h in t.fields}
        rows = [(r, s, f, old or "", new or "", is_new) for r, s, f, old, new, is_new in changes
                if (old or "") != (new or "")]
        rows.sort(key=lambda c: (c[0].seq, order[c[1]][0], order[c[1]][1].get(c[2], 999)))
        activity = cls.objects.create(
            user=user if user and user.is_authenticated else None,
            username=user.get_username() if user and user.is_authenticated else "",
            kind=kind, summary=summary[:300], details=details or {},
            record_count=records if records is not None else len({r.pk for r, *_ in rows}),
            change_count=len(rows),
            sections=sorted({s for _, s, *_ in rows}, key=lambda s: order[s][0]),
        )
        Change.objects.bulk_create([
            Change(activity=activity, record=r, eds_record_id=r.eds_record_id, program=r.program,
                   section=s, field=f, label=labels.get((s, f), f), old=old, new=new, new_record=is_new)
            for r, s, f, old, new, is_new in rows
        ], batch_size=1000)
        return activity


class Change(models.Model):
    """One field of one record changed by an Activity: old value -> new value."""

    activity = models.ForeignKey(Activity, on_delete=models.CASCADE, related_name="items")
    record = models.ForeignKey("record_identity.EDSRecord", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="+")
    eds_record_id = models.CharField(max_length=100, db_index=True)
    program = models.TextField(blank=True, default="")
    section = models.CharField(max_length=50, db_index=True)  # section app label
    field = models.CharField(max_length=100)
    label = models.CharField(max_length=200)  # the Excel header at the time
    old = models.TextField(blank=True, default="")
    new = models.TextField(blank=True, default="")
    new_record = models.BooleanField(default=False)  # the record was created by this activity

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.eds_record_id} {self.label}: {self.old!r} -> {self.new!r}"


# ── Workflow ──────────────────────────────────────────────────────────────────
# Where each EDS record is in the 9-stage flow. The rules live in core/flow.py.

class RecordFlow(models.Model):
    record = models.OneToOneField("record_identity.EDSRecord", on_delete=models.CASCADE, related_name="flow")
    stage = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=60, default="Draft")
    closed = models.BooleanField(default=False)
    stopped = models.BooleanField(default=False)  # CapEx rejected: only a demand change restarts it
    # Stage 2 runs two pieces of work in parallel
    rack_built = models.BooleanField(default=False)
    rack_submitted = models.BooleanField(default=False)
    parts_confirmed = models.BooleanField(default=False)
    # Stage 8: issued -> acknowledged -> received -> delivered
    po_state = models.CharField(max_length=20, blank=True, default="")
    since = models.DateTimeField(default=timezone.now)  # when the status last changed

    def __str__(self):
        return f"{self.record} · stage {self.stage} · {self.status}"


class SupplierRequest(models.Model):
    """One supplier asked in one feasibility round (stage 3); its award; then its alignment (stage 7)."""

    REQUESTED, RESPONDED, DECLINED, CLARIFY = "Requested", "Responded", "Declined", "Clarification asked"

    record = models.ForeignKey("record_identity.EDSRecord", on_delete=models.CASCADE, related_name="supplier_requests")
    round = models.PositiveSmallIntegerField(default=1)
    supplier = models.CharField(max_length=60)
    quantity = models.CharField(max_length=30, blank=True, default="")
    reply_due = models.CharField(max_length=10, blank=True, default="")
    status = models.CharField(max_length=30, default=REQUESTED)
    lead_time_weeks = models.CharField(max_length=10, blank=True, default="")
    capacity = models.CharField(max_length=30, blank=True, default="")
    price = models.CharField(max_length=30, blank=True, default="")
    qualification_support = models.TextField(blank=True, default="")
    note = models.TextField(blank=True, default="")  # decline reason or open question
    selected = models.BooleanField(null=True)  # None until the round is awarded
    allocated = models.CharField(max_length=30, blank=True, default="")
    # Alignment / supportability (stage 7)
    align_status = models.CharField(max_length=30, blank=True, default="")
    align_version = models.PositiveSmallIntegerField(default=0)
    needed_by = models.CharField(max_length=10, blank=True, default="")
    supported_qty = models.CharField(max_length=30, blank=True, default="")
    ship_dates = models.TextField(blank=True, default="")
    align_lead_time = models.CharField(max_length=10, blank=True, default="")
    constraints = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["round", "id"]

    @property
    def ref(self):
        return f"REQ-{self.pk:06d}"

    def __str__(self):
        return f"{self.ref} {self.supplier} · {self.record}"


class SupplierContact(models.Model):
    """A user in the Suppliers group and the supplier company they answer for."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="supplier_contact")
    supplier = models.CharField(max_length=60)

    def __str__(self):
        return f"{self.user} · {self.supplier}"
