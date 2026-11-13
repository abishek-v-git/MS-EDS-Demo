from django.contrib import admin

from .models import ExecutionClosure


@admin.register(ExecutionClosure)
class ExecutionClosureAdmin(admin.ModelAdmin):
    list_display = ("record", "mspn_msf", "updated_at")
    search_fields = ("record__eds_record_id",)
    list_select_related = ("record",)
