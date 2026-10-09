from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth import logout
from django.http import HttpRequest, HttpResponse
from django.utils import timezone

_TOUCH_INTERVAL = timedelta(minutes=5)


class SessionActivityMiddleware:
    """Tracks last activity (coarse-grained) and enforces the staff idle timeout."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            now = timezone.now()
            raw = request.session.get("_last_seen")
            last_seen = None
            if raw:
                try:
                    last_seen = datetime.fromisoformat(raw)
                except ValueError:
                    last_seen = None
            if (
                user.is_staff
                and last_seen is not None
                and (now - last_seen).total_seconds() > settings.STAFF_SESSION_IDLE_SECONDS
            ):
                logout(request)
            elif last_seen is None or now - last_seen > _TOUCH_INTERVAL:
                request.session["_last_seen"] = now.isoformat()
        return self.get_response(request)
