from django.contrib import admin

from .models import DemandDestination


@admin.register(DemandDestination)
class DemandDestinationAdmin(admin.ModelAdmin):
    list_display = ("record", "total_expected_demand", "updated_at")
    search_fields = ("record__eds_record_id",)
    list_select_related = ("record",)
