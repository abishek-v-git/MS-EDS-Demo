from django.contrib import admin

from .models import UploadLog


@admin.register(UploadLog)
class UploadLogAdmin(admin.ModelAdmin):
    list_display = ("file_name", "uploaded_at", "batch", "batch_position", "rows_read", "created", "updated", "unchanged", "skipped")
    list_filter = ("batch",)
