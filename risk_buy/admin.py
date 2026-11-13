from django.contrib import admin

from .models import RiskBuy


@admin.register(RiskBuy)
class RiskBuyAdmin(admin.ModelAdmin):
    list_display = ("record", "ado_work_item_id", "updated_at")
    search_fields = ("record__eds_record_id",)
    list_select_related = ("record",)
