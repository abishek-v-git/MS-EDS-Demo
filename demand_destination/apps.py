from django.apps import AppConfig


class DemandDestinationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "demand_destination"
    verbose_name = "Demand and destination"

    # Topic metadata (read by core.topics)
    topic_group = "Signal Intake"  # tab-strip group; "" = standalone
    topic_order = 3
    topic_model = "DemandDestination"
    topic_slug = "demand-destination"
    topic_icon = "bi-geo-alt"
    topic_accent = "#0f7b8a"
