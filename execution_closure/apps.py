from django.apps import AppConfig


class ExecutionClosureConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "execution_closure"
    verbose_name = "Execution and closure"

    # Topic metadata (read by core.topics)
    topic_group = "Risk Buy and Supplier Commitment"  # tab-strip group; "" = standalone
    topic_order = 7
    topic_model = "ExecutionClosure"
    topic_slug = "execution-closure"
    topic_icon = "bi-check2-circle"
    topic_accent = "#5b3f9e"
