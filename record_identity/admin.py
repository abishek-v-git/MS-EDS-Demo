from django.contrib import admin

from .models import EDSRecord


@admin.register(EDSRecord)
class EDSRecordAdmin(admin.ModelAdmin):
    list_display = ("eds_record_id", "program", "program_phase", "current_gate", "updated_at")
    search_fields = ("eds_record_id", "program", "demand_line_id")
