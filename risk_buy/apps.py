from django.apps import AppConfig


class RiskBuyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "risk_buy"
    verbose_name = "Risk Buy"

    # Topic metadata (read by core.topics)
    topic_group = "Risk Buy and Supplier Commitment"  # tab-strip group; "" = standalone
    topic_order = 6
    topic_model = "RiskBuy"
    topic_slug = "risk-buy"
    topic_icon = "bi-exclamation-triangle"
    topic_accent = "#b4521e"
