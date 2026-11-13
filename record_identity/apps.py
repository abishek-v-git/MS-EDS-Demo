from django.apps import AppConfig


class RecordIdentityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "record_identity"
    verbose_name = "Record Identity"

    # Topic metadata (read by core.topics)
    topic_group = "Signal Intake"  # tab-strip group; "" = standalone
    topic_order = 1
    topic_model = "EDSRecord"
    topic_slug = "record-identity"
    topic_icon = "bi-fingerprint"
    topic_accent = "#003366"
