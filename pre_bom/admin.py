from django.contrib import admin

from .models import PreBOM


@admin.register(PreBOM)
class PreBOMAdmin(admin.ModelAdmin):
    list_display = ("record", "rack_configuration_id", "updated_at")
    search_fields = ("record__eds_record_id",)
    list_select_related = ("record",)
