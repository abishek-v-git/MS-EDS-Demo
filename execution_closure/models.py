from django.db import models

from core.models import TopicSection


class ExecutionClosure(TopicSection):
    """Execution and closure fields for one EDS record."""

    # Long / combined text: shown as an expandable box in the table
    EXPANDABLE_FIELDS = (
        "reallocation_disposition",
        "lessons_learned",
    )

    # Stored as plain numbers; uploads must be numbers ($ and thousands commas are ignored).
    NUMBER_FIELDS = (
        "t2_forecast_quantity",
        "consumed_quantity",
        "excess_quantity",
    )

    # Stored as ISO dates (YYYY-MM-DD); uploads must be dates, the edit form uses date pickers.
    DATE_FIELDS = (
        "shipment_date",
        "receipt_date",
        "delivery_date",
        "t2_forecast_date",
        "closure_date",
    )

    mspn_msf = models.TextField("MSPN/MSF", blank=True, default="")
    orderable_wwt_enabled_status = models.TextField("Orderable/WWT-enabled status", blank=True, default="")
    po_number = models.TextField("PO number", blank=True, default="")
    po_line_number = models.TextField("PO line", blank=True, default="")
    shipment_date = models.TextField("Shipment date", blank=True, default="")
    receipt_date = models.TextField("Receipt date", blank=True, default="")
    delivery_date = models.TextField("Delivery date", blank=True, default="")
    t2_forecast_key = models.TextField("T2 forecast key", blank=True, default="")
    t2_forecast_date = models.TextField("T2 forecast date", blank=True, default="")
    t2_forecast_quantity = models.TextField("T2 forecast quantity", blank=True, default="")
    consumed_quantity = models.TextField("Consumed quantity", blank=True, default="")
    excess_quantity = models.TextField("Excess quantity", blank=True, default="")
    reallocation_disposition = models.TextField("Reallocation disposition", blank=True, default="")
    closure_approver = models.TextField("Closure approver", blank=True, default="")
    closure_date = models.TextField("Closure date", blank=True, default="")
    lessons_learned = models.TextField("Lessons learned", blank=True, default="")

    class Meta:
        verbose_name = "Execution and closure"
        verbose_name_plural = "Execution and closure"
