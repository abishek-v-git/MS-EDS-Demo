from django.contrib import admin

from .models import CommercialReadiness


@admin.register(CommercialReadiness)
class CommercialReadinessAdmin(admin.ModelAdmin):
    list_display = ("record", "supplier_owner", "updated_at")
    search_fields = ("record__eds_record_id",)
    list_select_related = ("record",)
