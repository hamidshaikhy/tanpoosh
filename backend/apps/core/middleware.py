from __future__ import annotations

import re
import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from .logging import request_id_var

_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9\-_.]{8,64}$")


class RequestIdMiddleware:
    """Assigns a request id (accepting a well-formed one from the proxy) for logs and error bodies."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        incoming = request.META.get("HTTP_X_REQUEST_ID", "")
        rid = incoming if _SAFE_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        request.request_id = rid  # type: ignore[attr-defined]
        token = request_id_var.set(rid)
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response["X-Request-ID"] = rid
        return response


class ApiSecurityHeadersMiddleware:
    """Strict headers for Django-served responses (JSON API + uploaded media in development).

    The Next.js app sets its own CSP for HTML pages.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        path = request.path
        if path.startswith("/media/"):
            # Uploaded content is untrusted: never let it execute or be framed.
            response["Content-Security-Policy"] = (
                "default-src 'none'; img-src 'self'; form-action 'none'; frame-ancestors 'none'; sandbox"
            )
            response["Cross-Origin-Resource-Policy"] = "same-origin"
        elif path.startswith("/api/"):
            response.setdefault(
                "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
            )
            # API responses are never stored by shared caches; public catalog caching happens in
            # the Next.js data cache (server-side, invalidated by tag) — never per-user payloads.
            response["Cache-Control"] = "no-store"
            response["Vary"] = "Cookie"
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        return response
