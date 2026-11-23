try:
    from . import flow
except ImportError:  # core/flow.py missing: run without the workflow extras
    flow = None
from .models import UploadLog
from .topics import get_groups, get_topics, identity_model


def nav(request):
    ctx = {"topics": get_topics(), "topic_groups": get_groups()}
    if request.user.is_authenticated:  # the login page shows the sections, never the data
        ctx.update({
            "last_upload": UploadLog.objects.first(),
            "eds_total": identity_model().objects.count(),  # shown in the "Clear all data" dialog
        })
        if flow is None:
            return ctx
        actor = flow.actor_for(request)
        ctx.update({
            "actor": actor,
            "supplier_only": actor.group == "sup" and not request.user.is_superuser,
            "act_as_choices": flow.act_as_choices() if request.user.is_superuser else (),
            "act_as_current": request.session.get("act_as", ""),
            "my_task_count": lambda: flow.task_count(actor),  # only counted where the template uses it
        })
    return ctx
