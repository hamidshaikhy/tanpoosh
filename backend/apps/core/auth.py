"""Session authentication that enforces CSRF on every unsafe request.

DRF's stock SessionAuthentication only checks CSRF for *authenticated* users, and DRF views are
csrf_exempt at the Django layer. That would leave anonymous login/signup/logout/cart mutations
without CSRF protection. This class checks CSRF for all unsafe methods regardless of auth state.
Views that are a narrow, documented exception (none at the moment) can set
`csrf_exempt_reason = "..."`.
"""

from __future__ import annotations

from typing import Any

from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework.authentication import SessionAuthentication

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


class _CSRFCheck(CsrfViewMiddleware):
    def _reject(self, request: Any, reason: str) -> str:  # type: ignore[override]
        return reason


def enforce_csrf(request: Any) -> None:
    def dummy_get_response(_request: Any) -> None:  # pragma: no cover - never called
        return None

    check = _CSRFCheck(dummy_get_response)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")


class CsrfEnforcedSessionAuthentication(SessionAuthentication):
    def authenticate(self, request: Any) -> tuple[Any, None] | None:
        django_request = request._request
        if request.method not in SAFE_METHODS:
            view = request.parser_context.get("view") if request.parser_context else None
            if not getattr(view, "csrf_exempt_reason", None):
                enforce_csrf(django_request)
        user = getattr(django_request, "user", None)
        if not user or not user.is_active:
            return None
        return (user, None)
