from django.conf import settings
from django.db import models

from core.models import TopicSection
from record_identity.models import eds_code


class PreBOM(TopicSection):
    """Pre-BOM and technical fields for one EDS record."""

    # Generated on create, same number as the EDS Record ID: RC-000001, MDM-000001.
    AUTO_FIELDS = ("rack_configuration_id", "platform_sku_mdm_id")

    # Long / combined text: shown as an expandable box in the table
    EXPANDABLE_FIELDS = (
        "firmware_sonic_readiness",
        "ppa_bom_milestone",
    )

    # Stored as plain numbers; uploads must be numbers ($ and thousands commas are ignored).
    NUMBER_FIELDS = (
        "switch_qty_per_rack",
    )

    # Stored as ISO dates (YYYY-MM-DD); uploads must be dates, the edit form uses date pickers.
    DATE_FIELDS = (
        "qualification_date",
    )

    rack_configuration_id = models.TextField(editable=False, verbose_name="Rack configuration ID", blank=True, default="")
    platform_sku_mdm_id = models.TextField(editable=False, verbose_name="Platform SKU/MDM ID", blank=True, default="")
    cpu_generation = models.TextField("CPU generation", blank=True, default="")
    ovl_generation = models.TextField("OVL generation", blank=True, default="")
    network_layer = models.TextField("Network layer", blank=True, default="")
    application = models.TextField("Application", blank=True, default="")
    switch_role = models.TextField("Switch role", blank=True, default="")
    switch_qty_per_rack = models.TextField("Switch quantity per rack", blank=True, default="")
    preliminary_mpn = models.TextField("Preliminary MPN", blank=True, default="")
    final_mpn = models.TextField("Final MPN", blank=True, default="")
    alternate_mpn = models.TextField("Alternate MPN", blank=True, default="")
    firmware_sonic_readiness = models.TextField("Firmware/SONiC readiness", blank=True, default="")
    avl_status = models.TextField("AVL status", blank=True, default="")
    qualification_status = models.TextField("Qualification status", blank=True, default="")
    qualification_date = models.TextField("Qualification date", blank=True, default="")
    engineering_green_light = models.TextField("Engineering green-light", blank=True, default="")
    ppa_bom_milestone = models.TextField("PPA/BOM milestone", blank=True, default="")
    confidence = models.TextField("Confidence", blank=True, default="")

    class Meta:
        verbose_name = "Pre-BOM and technical"
        verbose_name_plural = "Pre-BOM and technical"

    @classmethod
    def generated_fields(cls, seq):
        return {
            "rack_configuration_id": eds_code(settings.EDS_RACK_CONFIG_PREFIX, seq),
            "platform_sku_mdm_id": eds_code(settings.EDS_PLATFORM_PREFIX, seq),
        }
