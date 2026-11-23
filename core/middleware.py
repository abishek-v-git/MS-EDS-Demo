from django.contrib.auth.middleware import LoginRequiredMiddleware
from django.http import JsonResponse
from django.shortcuts import redirect, resolve_url


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


class SupplierScope:
    """Supplier users only see their own requests: Home, the action dialogs and sign-out.

    Everything else (section tables, other records, search, export, history) holds other
    suppliers' prices and replies, so they are sent back to Home.
    """

    ALLOWED = {"home", "record_action", "logout", "login"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_view(self, request, view_func, view_args, view_kwargs):
        user = request.user
        if not user.is_authenticated or user.is_superuser:
            return None
        match = request.resolver_match
        if match and match.url_name in self.ALLOWED:
            return None
        if request.path.startswith(("/static/",)):
            return None
        if user.groups.filter(name="Suppliers").exists():
            if request.headers.get("X-Requested-With"):
                return JsonResponse({"error": "not_allowed"}, status=403)
            return redirect("home")
        return None
