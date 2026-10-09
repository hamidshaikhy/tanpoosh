"""Role-based staff permissions (least privilege) and DRF permission classes.

Every management endpoint declares `permission_map = {"GET": "orders.view", "POST": "..."}`.
Methods missing from the map are denied (fail closed). Staff sessions must have completed MFA
(unless the development-only bypass is on). Sensitive operations additionally require a recent
re-authentication (password + TOTP) via `require_recent_reauth`.
"""

from __future__ import annotations

import time
from typing import Any

from django.conf import settings
from rest_framework import exceptions
from rest_framework.permissions import BasePermission

from apps.core.errors import ApiError

from .models import Role

ALL_PERMISSIONS = frozenset(
    {
        "dashboard.view",
        "reports.view",
        "catalog.view",
        "catalog.edit",
        "catalog.publish",
        "media.upload",
        "inventory.view",
        "inventory.adjust",
        "orders.view",
        "orders.fulfill",
        "orders.cancel",
        "returns.view",
        "returns.manage",
        "payments.view",
        "payments.reconcile",
        "payments.export",
        "refunds.manage",
        "coupons.manage",
        "shipping.manage",
        "customers.view",
        "customers.manage",
        "staff.manage",
        "content.manage",
        "settings.manage",
        "reviews.moderate",
        "support.manage",
        "audit.view",
    }
)

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    Role.OWNER: ALL_PERMISSIONS,
    Role.CATALOG_MANAGER: frozenset(
        {
            "dashboard.view",
            "catalog.view",
            "catalog.edit",
            "catalog.publish",
            "media.upload",
            "inventory.view",
            "inventory.adjust",
            "content.manage",
            "reviews.moderate",
        }
    ),
    Role.ORDER_MANAGER: frozenset(
        {
            "dashboard.view",
            "catalog.view",
            "inventory.view",
            "orders.view",
            "orders.fulfill",
            "orders.cancel",
            "returns.view",
            "returns.manage",
            "payments.view",
            "customers.view",
            "support.manage",
        }
    ),
    Role.FINANCE: frozenset(
        {
            "dashboard.view",
            "reports.view",
            "orders.view",
            "returns.view",
            "payments.view",
            "payments.reconcile",
            "payments.export",
            "refunds.manage",
            "coupons.manage",
            "shipping.manage",
            "customers.view",
        }
    ),
    Role.CUSTOMER: frozenset(),
}


def role_permissions(role: str) -> frozenset[str]:
    return ROLE_PERMISSIONS.get(role, frozenset())


def role_has_permission(role: str, perm: str) -> bool:
    return perm in role_permissions(role)


MFA_SESSION_KEY = "_mfa_verified_at"
REAUTH_SESSION_KEY = "_reauth_at"


def mfa_bypass_active() -> bool:
    return bool(settings.MFA_DEV_BYPASS) and not settings.IS_PRODUCTION


def mfa_satisfied(request: Any) -> bool:
    if mfa_bypass_active():
        return True
    session = getattr(request, "session", None)
    return bool(session is not None and session.get(MFA_SESSION_KEY))


def require_recent_reauth(request: Any) -> None:
    session = request.session
    stamp = session.get(REAUTH_SESSION_KEY)
    if not stamp or (time.time() - float(stamp)) > settings.REAUTH_WINDOW_SECONDS:
        raise ApiError("reauth_required", status_code=403)


class IsStaffMember(BasePermission):
    """Authenticated active staff with completed MFA (no specific permission)."""

    def has_permission(self, request: Any, view: Any) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            raise exceptions.NotAuthenticated()
        if not user.is_active or not user.is_staff:
            return False
        if not mfa_satisfied(request):
            raise ApiError("mfa_required", status_code=403)
        return True


class HasStaffPermission(IsStaffMember):
    def has_permission(self, request: Any, view: Any) -> bool:
        if not super().has_permission(request, view):
            return False
        permission_map: dict[str, str] = getattr(view, "permission_map", {})
        method = "GET" if request.method in {"HEAD", "OPTIONS"} else request.method
        required = permission_map.get(method)
        if required is None:
            return False  # fail closed
        return role_has_permission(request.user.role, required)


class IsCustomerAuthenticated(BasePermission):
    def has_permission(self, request: Any, view: Any) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            raise exceptions.NotAuthenticated()
        return bool(user.is_active)
