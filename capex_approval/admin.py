from django.contrib import admin

from .models import CapexApproval


@admin.register(CapexApproval)
class CapexApprovalAdmin(admin.ModelAdmin):
    list_display = ("record", "status", "updated_at")
    search_fields = ("record__eds_record_id",)
    list_select_related = ("record",)
