"""Consistent JSON error envelope for every API response.

    {"error": {"code": "stable_code", "message": "پیام فارسی", "fields": {...}, "request_id": "..."}}

Tracebacks, SQL and internal details are never returned to clients.
"""

from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import DatabaseError, OperationalError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import set_rollback

logger = logging.getLogger("tanpoosh.api")

MESSAGES = {
    "validation_error": "اطلاعات واردشده معتبر نیست.",
    "not_authenticated": "برای ادامه وارد حساب کاربری شوید.",
    "permission_denied": "اجازهٔ انجام این کار را ندارید.",
    "csrf_failed": "نشست امنیتی منقضی شده است؛ صفحه را تازه کنید و دوباره تلاش کنید.",
    "not_found": "موردی پیدا نشد.",
    "method_not_allowed": "این عملیات پشتیبانی نمی‌شود.",
    "rate_limited": "تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.",
    "parse_error": "قالب درخواست معتبر نیست.",
    "unsupported_media_type": "نوع محتوای درخواست پشتیبانی نمی‌شود.",
    "server_error": "خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.",
    "service_unavailable": "سرویس موقتاً در دسترس نیست. لطفاً کمی بعد تلاش کنید.",
    "mfa_required": "برای دسترسی به پنل مدیریت، تأیید دومرحله‌ای لازم است.",
    "reauth_required": "برای این عملیات حساس، دوباره هویت خود را تأیید کنید.",
}


class ApiError(exceptions.APIException):
    """Business/domain error with a stable machine code and a Persian message."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "bad_request"

    def __init__(
        self,
        code: str,
        message: str | None = None,
        *,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        fields: dict[str, list[str]] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message or MESSAGES.get(code, MESSAGES["validation_error"])
        self.status_code = status_code
        self.fields = fields or {}
        self.extra = extra or {}
        super().__init__(detail=self.message, code=code)


class Conflict(ApiError):
    def __init__(self, code: str, message: str, **kwargs: Any) -> None:
        super().__init__(code, message, status_code=status.HTTP_409_CONFLICT, **kwargs)


class ServiceUnavailable(ApiError):
    def __init__(self, message: str | None = None) -> None:
        super().__init__("service_unavailable", message, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)


def _flatten(detail: Any, prefix: str = "") -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    if isinstance(detail, dict):
        for key, value in detail.items():
            name = f"{prefix}.{key}" if prefix else str(key)
            for k, v in _flatten(value, name).items():
                out.setdefault(k, []).extend(v)
    elif isinstance(detail, list):
        if all(not isinstance(item, (dict, list)) for item in detail):
            out.setdefault(prefix or "non_field_errors", []).extend(str(i) for i in detail)
        else:
            for index, item in enumerate(detail):
                name = f"{prefix}.{index}" if prefix else str(index)
                for k, v in _flatten(item, name).items():
                    out.setdefault(k, []).extend(v)
    else:
        out.setdefault(prefix or "non_field_errors", []).append(str(detail))
    return out


def error_body(code: str, message: str, request: Any = None, **extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "message": message}
    body.update({k: v for k, v in extra.items() if v not in (None, {}, [])})
    body["request_id"] = getattr(request, "request_id", None) if request is not None else None
    return {"error": body}


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    request = context.get("request")
    django_request = getattr(request, "_request", request)
    headers: dict[str, str] = {}

    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    if isinstance(exc, ApiError):
        set_rollback()
        return Response(
            error_body(exc.code, exc.message, django_request, fields=exc.fields, **exc.extra),
            status=exc.status_code,
        )

    if isinstance(exc, exceptions.APIException):
        set_rollback()
        if isinstance(exc, exceptions.ValidationError):
            code, fields = "validation_error", _flatten(exc.detail)
        elif isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
            code, fields = "not_authenticated", {}
        elif isinstance(exc, exceptions.PermissionDenied):
            detail = str(exc.detail)
            code = "csrf_failed" if detail.startswith("CSRF Failed") else "permission_denied"
            fields = {}
        elif isinstance(exc, exceptions.NotFound):
            code, fields = "not_found", {}
        elif isinstance(exc, exceptions.MethodNotAllowed):
            code, fields = "method_not_allowed", {}
        elif isinstance(exc, exceptions.Throttled):
            code, fields = "rate_limited", {}
            if exc.wait:
                headers["Retry-After"] = str(int(exc.wait))
        elif isinstance(exc, exceptions.ParseError):
            code, fields = "parse_error", {}
        elif isinstance(exc, exceptions.UnsupportedMediaType):
            code, fields = "unsupported_media_type", {}
        else:
            code, fields = "server_error" if exc.status_code >= 500 else "bad_request", {}
        message = MESSAGES.get(code, MESSAGES["validation_error"])
        status_code = exc.status_code
        if code == "not_authenticated":
            status_code = status.HTTP_401_UNAUTHORIZED
        return Response(error_body(code, message, django_request, fields=fields), status=status_code, headers=headers)

    # Unexpected exceptions: log with request id, return a generic body.
    set_rollback()
    if isinstance(exc, (OperationalError, DatabaseError)):
        logger.exception("Database unavailable or failed")
        return Response(
            error_body("service_unavailable", MESSAGES["service_unavailable"], django_request),
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    logger.exception("Unhandled API exception")
    return Response(
        error_body("server_error", MESSAGES["server_error"], django_request),
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
