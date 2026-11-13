from django.db import models

from core.models import TopicSection


class DemandDestination(TopicSection):
    """Demand and destination fields for one EDS record."""

    # Long / combined text: shown as an expandable box in the table
    EXPANDABLE_FIELDS = (
        "allocation_conflict",
    )

    # Stored as plain numbers; uploads must be numbers ($ and thousands commas are ignored).
    NUMBER_FIELDS = (
        "delivered_quantity",
        "open_quantity",
    )

    # Stored as ISO dates (YYYY-MM-DD); uploads must be dates, the edit form uses date pickers.
    DATE_FIELDS = ("required_at_wwt", "required_at_si", "required_at_site")

    # Per-month quantities (canonical "2026-11: 40; 2026-12: 48", see core.monthly).
    # Edited as a month grid; clicking the Monthly profile cell opens the monthly card.
    MONTHLY_PROFILE_FIELD = "monthly_profile"
    MONTHLY_PROFILE_TRIGGERS = ("monthly_profile",)

    total_expected_demand = models.TextField("Total expected demand", blank=True, default="")
    monthly_profile = models.TextField("Monthly profile", blank=True, default="")
    capex_approved_quantity = models.TextField("CapEx-approved quantity", blank=True, default="")
    risk_buy_quantity = models.TextField("Risk-buy quantity", blank=True, default="")
    po_quantity = models.TextField("PO quantity", blank=True, default="")
    supplier_committed_quantity = models.TextField("Supplier-committed quantity", blank=True, default="")
    delivered_quantity = models.TextField("Delivered quantity", blank=True, default="")
    open_quantity = models.TextField("Open quantity", blank=True, default="")
    required_at_wwt = models.TextField("Required-at-WWT date", blank=True, default="")
    required_at_si = models.TextField("Required-at-SI date", blank=True, default="")
    required_at_site = models.TextField("Required-at-site date", blank=True, default="")
    rack_landed_date = models.TextField("Rack-landed date", blank=True, default="")
    target_si_odm = models.TextField("Target SI/ODM", blank=True, default="")
    df_site_lab = models.TextField("DF site/lab", blank=True, default="")
    region = models.TextField("Region", blank=True, default="")
    build_type = models.TextField("Build type", blank=True, default="")
    priority = models.TextField("Priority", blank=True, default="")
    allocation_conflict = models.TextField("Allocation conflict", blank=True, default="")

    class Meta:
        verbose_name = "Demand and destination"
        verbose_name_plural = "Demand and destination"
