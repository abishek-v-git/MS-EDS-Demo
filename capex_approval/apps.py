from django.apps import AppConfig


class CapexApprovalConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "capex_approval"
    verbose_name = "Capex Approval"

    # Topic metadata (read by core.topics)
    topic_group = "Capex Approval"  # tab-strip group label
    topic_order = 5
    topic_model = "CapexApproval"
    topic_slug = "capex-approval"
    topic_icon = "bi-cash-coin"
    topic_accent = "#8a6d0f"
