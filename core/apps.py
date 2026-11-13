from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "MS-EDS core"

    def ready(self):
        from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed

        from . import logs

        user_logged_in.connect(logs.on_login, dispatch_uid="core.logs.on_login")
        user_logged_out.connect(logs.on_logout, dispatch_uid="core.logs.on_logout")
        user_login_failed.connect(logs.on_login_failed, dispatch_uid="core.logs.on_login_failed")
