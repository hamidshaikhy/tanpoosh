from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.db import connection
from django.http import FileResponse, Http404, HttpRequest, JsonResponse
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import ratelimit
from .errors import MESSAGES, error_body


def csrf_failure(request: HttpRequest, reason: str = "") -> JsonResponse:
    return JsonResponse(error_body("csrf_failed", MESSAGES["csrf_failed"], request), status=403)


def json_404(request: HttpRequest, exception: Exception | None = None) -> JsonResponse:
    return JsonResponse(error_body("not_found", MESSAGES["not_found"], request), status=404)


def json_500(request: HttpRequest) -> JsonResponse:
    return JsonResponse(error_body("server_error", MESSAGES["server_error"], request), status=500)


class LivenessView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses=inline_serializer("Liveness", {"status": serializers.CharField()}))
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class ReadinessView(APIView):
    """Checks DB and Redis connectivity. Exposes no versions, hosts or internal details."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(
        responses=inline_serializer(
            "Readiness",
            {"status": serializers.CharField(), "database": serializers.BooleanField(), "redis": serializers.BooleanField()},
        )
    )
    def get(self, request: Request) -> Response:
        db_ok = True
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:  # noqa: BLE001
            db_ok = False
        redis_ok = ratelimit.ping()
        ready = db_ok and redis_ok
        return Response(
            {"status": "ready" if ready else "degraded", "database": db_ok, "redis": redis_ok},
            status=200 if ready else 503,
        )


# Explicit map (platform mimetypes databases differ, e.g. .webp is unknown on some Windows hosts).
_MEDIA_TYPES = {".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def serve_media(request: HttpRequest, path: str) -> FileResponse:
    """Development-only media serving with safe headers (production uses object storage/proxy)."""
    if not settings.SERVE_MEDIA:
        raise Http404()
    root = Path(settings.MEDIA_ROOT).resolve()
    target = (root / path).resolve()
    if root not in target.parents or not target.is_file():
        raise Http404()
    content_type = _MEDIA_TYPES.get(target.suffix.lower())
    if content_type is None:
        raise Http404()
    response = FileResponse(target.open("rb"), content_type=content_type)
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "public, max-age=86400"
    return response
