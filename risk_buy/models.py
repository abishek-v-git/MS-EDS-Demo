from django.db import models

from core.models import TopicSection


class RiskBuy(TopicSection):
    """Risk Buy fields for one EDS record."""

    # Long / combined text: shown as an expandable box in the table
    EXPANDABLE_FIELDS = (
        "inventory_netting",
        "decision_closure_status",
    )

    # Stored as plain numbers; uploads must be numbers ($ and thousands commas are ignored).
    NUMBER_FIELDS = (
        "requested_quantity",
        "approved_quantity",
        "requested_value",
        "approved_value",
    )

    ado_work_item_id = models.TextField("ADO work-item ID", blank=True, default="")
    risk_type = models.TextField("Type", blank=True, default="")
    decision_required_date = models.TextField("Decision-required date", blank=True, default="")
    requested_quantity = models.TextField("Risk-buy requested quantity", blank=True, default="")
    approved_quantity = models.TextField("Risk-buy approved quantity", blank=True, default="")
    requested_value = models.TextField("Risk-buy requested value", blank=True, default="")
    approved_value = models.TextField("Risk-buy approved value", blank=True, default="")
    exposure_owner = models.TextField("Exposure owner", blank=True, default="")
    ncnr_amount = models.TextField("NCNR amount", blank=True, default="")
    lead_time_gap = models.TextField("Lead-time gap", blank=True, default="")
    inventory_netting = models.TextField("Inventory netting", blank=True, default="")
    po_required_date = models.TextField("PO-required date", blank=True, default="")
    decision_closure_status = models.TextField("Decision and closure status", blank=True, default="")

    class Meta:
        verbose_name = "Risk Buy"
        verbose_name_plural = "Risk Buy"
