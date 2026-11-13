from django.apps import AppConfig


class CommercialReadinessConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "commercial_readiness"
    verbose_name = "Commercial and supplier readiness"

    # Topic metadata (read by core.topics)
    topic_group = "Supplier Feasibility"  # tab-strip group; "" = standalone
    topic_order = 4
    topic_model = "CommercialReadiness"
    topic_slug = "commercial-readiness"
    topic_icon = "bi-truck"
    topic_accent = "#2e7d4f"
