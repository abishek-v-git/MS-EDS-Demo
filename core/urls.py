from django.urls import include, path

from . import views
from .topics import get_topics


def topic_urls(label):
    """The pages every section tab has, under the namespace `label` (e.g. "pre_bom:table")."""
    kw = {"app_label": label}
    return ([
        path("", views.topic_table, kw, name="table"),
        path("data/", views.topic_data, kw, name="data"),
        path("export/", views.topic_export, kw, name="export"),
        path("edit/<int:pk>/", views.topic_edit, kw, name="edit"),
    ], label)


urlpatterns = [
    path("", views.home, name="home"),
    path("login/", views.SignInView.as_view(), name="login"),
    path("logout/", views.SignOutView.as_view(), name="logout"),
    path("upload/", views.upload, name="upload"),
    path("export/", views.export_all, name="export_all"),
    path("reset/", views.reset_data, name="reset_data"),
    path("search/", views.master_search, name="master_search"),
    path("history/", views.history, name="history"),
    path("history/<int:pk>/changes/", views.history_changes, name="history_changes"),
    path("program/", views.program_detail, name="program_detail"),
    path("record/new/", views.record_form, name="record_new"),
    path("record/pick/", views.record_pick, name="record_pick"),
    path("record/<int:pk>/edit/", views.record_form, name="record_edit"),
    path("template/", views.download_template, name="download_template"),
    # Each section is mounted at its own slug, e.g. /pre-bom/
    *[path(f"{t.slug}/", include(topic_urls(t.label))) for t in get_topics()],
]
