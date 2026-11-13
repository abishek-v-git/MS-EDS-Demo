"""Logging helpers (configured in settings.LOGGING).

Log files live in settings.LOG_DIR, one per day and kind:

    logs/app-2026-11-12.log      everything at LOG_LEVEL and above (imports, edits, sign-ins, ...)
    logs/errors-2026-11-12.log   errors only, with tracebacks

Every line carries the signed-in user and client IP of the request it came from, or "-".

This module is imported while logging is configured, before Django's apps are loaded, so it must
not import models or anything that does (e.g. django.contrib.auth.middleware).
"""
import contextvars
import datetime as dt
import logging
import threading
from pathlib import Path

_request_user = contextvars.ContextVar("log_user", default="-")
_request_ip = contextvars.ContextVar("log_ip", default="-")


def client_ip(request):
    """The client's address. Behind a reverse proxy, REMOTE_ADDR is the proxy's address."""
    return request.META.get("REMOTE_ADDR") or "-"


class RequestContextFilter(logging.Filter):
    """Adds %(user)s and %(ip)s to every record."""

    def filter(self, record):
        record.user = _request_user.get()
        record.ip = _request_ip.get()
        return True


class RequestContextMiddleware:
    """Remembers who is making the current request, for RequestContextFilter."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        tokens = (_request_user.set(user.get_username() if user and user.is_authenticated else "-"),
                  _request_ip.set(client_ip(request)))
        try:
            return self.get_response(request)
        finally:
            _request_user.reset(tokens[0])
            _request_ip.reset(tokens[1])


class DailyFileHandler(logging.Handler):
    """Appends to <directory>/<prefix>-YYYY-MM-DD.log and keeps the last `keep_days` files.

    Unlike TimedRotatingFileHandler it never renames a file, so it is safe when several
    processes write the same logs (the dev server's reloader, several web workers) and on
    Windows, where renaming a file another process holds open fails.
    """

    def __init__(self, directory, prefix="app", keep_days=14, level=logging.NOTSET):
        super().__init__(level)
        self.directory = Path(directory)
        self.prefix = prefix
        self.keep_days = keep_days
        self._day = None
        self._stream = None
        self._io_lock = threading.Lock()

    def _path(self, day):
        return self.directory / f"{self.prefix}-{day.isoformat()}.log"

    def _open(self, day):
        if self._stream:
            self._stream.close()
        self.directory.mkdir(parents=True, exist_ok=True)
        self._stream = open(self._path(day), "a", encoding="utf-8")
        self._day = day
        self._prune(day)

    def _prune(self, today):
        oldest = today - dt.timedelta(days=self.keep_days - 1)
        for f in self.directory.glob(f"{self.prefix}-*.log"):
            try:
                if dt.date.fromisoformat(f.stem[len(self.prefix) + 1:]) < oldest:
                    f.unlink()
            except (ValueError, OSError):
                pass  # not one of ours, or still open in another process: try again tomorrow

    def emit(self, record):
        try:
            msg = self.format(record)
            day = dt.date.fromtimestamp(record.created)
            with self._io_lock:
                if day != self._day or self._stream is None:
                    self._open(day)
                self._stream.write(msg + "\n")
                self._stream.flush()
        except Exception:
            self.handleError(record)

    def close(self):
        with self._io_lock:
            if self._stream:
                self._stream.close()
                self._stream = None
        super().close()


# ── Sign-in events (connected in CoreConfig.ready) ────────────────────────────

auth_log = logging.getLogger("core.auth")


def on_login(sender, request, user, **kwargs):
    auth_log.info("Signed in: %s from %s", user.get_username(), client_ip(request) if request else "-")


def on_logout(sender, request, user, **kwargs):
    if user is not None:
        auth_log.info("Signed out: %s", user.get_username())


def on_login_failed(sender, credentials, request=None, **kwargs):
    # credentials has the password masked by Django; only the username is logged
    auth_log.warning("Failed sign-in for username %r from %s",
                     credentials.get("username", ""), client_ip(request) if request else "-")
