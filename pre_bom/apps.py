from django.apps import AppConfig


class PreBomConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "pre_bom"
    verbose_name = "Pre-BOM and technical"

    # Topic metadata (read by core.topics)
    topic_group = "Signal Intake"  # tab-strip group; "" = standalone
    topic_order = 2
    topic_model = "PreBOM"
    topic_slug = "pre-bom"
    topic_icon = "bi-cpu"
    topic_accent = "#1f5fa8"
