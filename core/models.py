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

    IMPORT, EDIT, CREATE, RESET = "import", "edit", "create", "reset"
    KINDS = [(IMPORT, "Import"), (EDIT, "Edit"), (CREATE, "New record"), (RESET, "Clear all data")]

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
