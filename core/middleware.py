from django.contrib.auth.middleware import LoginRequiredMiddleware
from django.http import JsonResponse
from django.shortcuts import resolve_url


class LoginRequired(LoginRequiredMiddleware):
    """Every page needs a signed-in user (views opt out with @login_not_required).

    Pages redirect to the login page. Background requests from the page's scripts (they send
    X-Requested-With) get a 401 instead, so the page can reload into the login page rather
    than trying to read the login HTML as data.
    """

    def handle_no_permission(self, request, view_func):
        if request.headers.get("X-Requested-With"):
            return JsonResponse({"error": "login_required", "login_url": resolve_url(self.get_login_url(view_func))},
                                status=401)
        return super().handle_no_permission(request, view_func)
