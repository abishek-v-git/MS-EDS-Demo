from .models import UploadLog
from .topics import get_groups, get_topics, identity_model


def nav(request):
    ctx = {"topics": get_topics(), "topic_groups": get_groups()}
    if request.user.is_authenticated:  # the login page shows the sections, never the data
        ctx.update({
            "last_upload": UploadLog.objects.first(),
            "eds_total": identity_model().objects.count(),  # shown in the "Clear all data" dialog
        })
    return ctx
