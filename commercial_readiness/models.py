from django.db import models

from core.models import TopicSection


class CommercialReadiness(TopicSection):
    """Commercial and supplier readiness fields for one EDS record."""

    # Long / combined text: shown as an expandable box in the table
    EXPANDABLE_FIELDS = (
        "qualification_software_dependency",
    )

    # Stored as plain numbers; uploads must be numbers ($ and thousands commas are ignored).
    NUMBER_FIELDS = (
        "unit_price",
        "commit_quantity",
    )

    # Stored as ISO dates (YYYY-MM-DD); uploads must be dates, the edit form uses date pickers.
    DATE_FIELDS = (
        "price_valid_until",
        "commit_date",
    )

    supplier_owner = models.TextField("Supplier owner", blank=True, default="")
    supplier_contact = models.TextField("Supplier contact", blank=True, default="")
    unit_price = models.TextField("Unit price", blank=True, default="")
    currency = models.TextField("Currency", blank=True, default="")
    price_valid_until = models.TextField("Price valid until", blank=True, default="")
    lead_time = models.TextField("Lead time", blank=True, default="")
    capacity = models.TextField("Capacity", blank=True, default="")
    clear_to_build_status = models.TextField("Clear-to-build status", blank=True, default="")
    reserved_allocation = models.TextField("Reserved allocation", blank=True, default="")
    qualification_software_dependency = models.TextField("Qualification/software dependency", blank=True, default="")
    risk_buy_by_date = models.TextField("Risk-buy-by date", blank=True, default="")
    commit_quantity = models.TextField("Commit quantity", blank=True, default="")
    commit_date = models.TextField("Commit date", blank=True, default="")
    commit_version = models.TextField("Commit version", blank=True, default="")
    supply_health = models.TextField("Supply health", blank=True, default="")

    class Meta:
        verbose_name = "Commercial and supplier readiness"
        verbose_name_plural = "Commercial and supplier readiness"
