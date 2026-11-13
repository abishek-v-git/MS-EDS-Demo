from django.db import models

from core.models import TopicSection


class CapexApproval(TopicSection):
    """Capex Approval fields for one EDS record."""

    # Long / combined text: shown as an expandable box in the table
    EXPANDABLE_FIELDS = (
    )

    # Stored as plain numbers; uploads must be numbers ($ and thousands commas are ignored).
    NUMBER_FIELDS = (
        "requested_amount",
        "approved_amount",
        "requested_quantity",
        "approved_quantity",
    )

    # Stored as ISO dates (YYYY-MM-DD); uploads must be dates, the edit form uses date pickers.
    DATE_FIELDS = (
        "approval_date",
    )

    status = models.TextField("Status", blank=True, default="")
    reference_id = models.TextField("Reference ID", blank=True, default="")
    budget_owner = models.TextField("Budget owner", blank=True, default="")
    finance_owner = models.TextField("Finance owner", blank=True, default="")
    approval_authority = models.TextField("Approval authority", blank=True, default="")
    approval_date = models.TextField("Approval date", blank=True, default="")
    requested_amount = models.TextField("Requested amount", blank=True, default="")
    approved_amount = models.TextField("Approved amount", blank=True, default="")
    requested_quantity = models.TextField("Requested quantity", blank=True, default="")
    approved_quantity = models.TextField("Approved quantity", blank=True, default="")
    coverage_period = models.TextField("Coverage period", blank=True, default="")
    evidence_link = models.TextField("Evidence link", blank=True, default="")
    remaining_unfunded_demand = models.TextField("Remaining unfunded demand", blank=True, default="")

    class Meta:
        verbose_name = "Capex Approval"
        verbose_name_plural = "Capex Approval"
