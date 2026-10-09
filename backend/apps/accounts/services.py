"""Authentication and account application services."""

from __future__ import annotations

import hashlib
import time
from typing import Any

from django.conf import settings
from django.contrib.auth import authenticate, update_session_auth_hash
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import exceptions

from apps.core import audit, ratelimit
from apps.core.errors import ApiError
from apps.core.net import client_ip, ip_prefix
from apps.core.normalize import (
    is_valid_username,
    normalize_email,
    normalize_mobile,
    normalize_username,
)
from apps.core.outbox import enqueue

from . import mfa
from .models import Role, User, UserSession
from .permissions import MFA_SESSION_KEY, REAUTH_SESSION_KEY, mfa_bypass_active, role_permissions
from .tokens import email_verification_tokens, encode_uid, password_reset_tokens

INVALID_CREDENTIALS = "نام کاربری/ایمیل یا رمز عبور نادرست است."


def password_errors(password: str, user: User | None = None) -> list[str]:
    if len(password) > settings.PASSWORD_MAX_LENGTH:
        return [f"رمز عبور حداکثر می‌تواند {settings.PASSWORD_MAX_LENGTH} نویسه باشد."]
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        return list(exc.messages)
    return []


def session_id_for(session_key: str) -> str:
    return hashlib.sha256(session_key.encode()).hexdigest()[:24]


def serialize_me(request: Any) -> dict[str, Any]:
    user = request.user
    if not user.is_authenticated:
        return {"authenticated": False, "user": None}
    enrolled = mfa.is_enrolled(user) if user.is_staff else False
    return {
        "authenticated": True,
        "user": {
            "id": str(user.pk),
            "username": user.username,
            "email": user.email,
            "email_verified": user.email_verified,
            "pending_email": user.pending_email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone": user.phone,
            "role": user.role,
            "role_label": Role(user.role).label,
            "is_staff": user.is_staff,
            "permissions": sorted(role_permissions(user.role)) if user.is_staff else [],
            "mfa": {
                "enrolled": enrolled,
                "verified": bool(request.session.get(MFA_SESSION_KEY)) or mfa_bypass_active(),
                "required": user.is_staff,
                "dev_bypass": mfa_bypass_active(),
            },
        },
    }


def _stamp_session(request: Any) -> None:
    now = timezone.now().isoformat()
    request.session["_ip_prefix"] = ip_prefix(client_ip(request))
    request.session["_ua"] = request.META.get("HTTP_USER_AGENT", "")[:200]
    request.session["_created_at"] = now
    request.session["_last_seen"] = now


def _establish_session(request: Any, user: User) -> list[dict[str, Any]]:
    """Log in (rotates session key + CSRF token) and merge the guest cart atomically."""
    from apps.carts.services import merge_guest_cart

    guest_cart_id = request.session.get("cart_id")
    guest_orders = list(request.session.get("guest_orders", []))
    django_login(request, user, backend="apps.accounts.backends.IdentifierBackend")
    _stamp_session(request)
    request.session["guest_orders"] = guest_orders[-20:]
    notices = merge_guest_cart(request, user, guest_cart_id)
    return notices


def login(request: Any, identifier: str, password: str) -> dict[str, Any]:
    ip = client_ip(request)
    ident_key = normalize_email(identifier) if "@" in identifier else normalize_username(identifier)
    ratelimit.enforce("login.ip", ip)
    blocked = ratelimit.is_blocked("login.account", ident_key)
    if not blocked.allowed:
        raise exceptions.Throttled(wait=blocked.retry_after)

    user = authenticate(request, identifier=identifier, password=password)
    if user is None:
        ratelimit.hit("login.account", ident_key)
        audit.record(
            "auth.login_failed",
            request=request,
            result="failed",
            metadata={"identifier_hash": hashlib.sha256(ident_key.encode()).hexdigest()[:16]},
        )
        raise ApiError("invalid_credentials", INVALID_CREDENTIALS)

    ratelimit.reset("login.account", ident_key)
    notices = _establish_session(request, user)
    if user.is_staff:
        audit.record("auth.staff_login", actor=user, request=request, obj=user)
    return {**serialize_me(request), "merge_notices": notices, "csrf_token": get_token(request)}


def logout(request: Any) -> dict[str, Any]:
    if request.user.is_authenticated and request.user.is_staff:
        audit.record("auth.staff_logout", request=request, obj=request.user)
    django_logout(request)
    return {"authenticated": False, "user": None, "csrf_token": get_token(request)}


def register(request: Any, *, username: str, email: str, password: str, first_name: str, last_name: str) -> dict[str, Any]:
    ratelimit.enforce("signup.ip", client_ip(request))
    username = normalize_username(username)
    email = normalize_email(email)
    fields: dict[str, list[str]] = {}
    if not is_valid_username(username):
        fields["username"] = ["نام کاربری باید ۳ تا ۳۲ نویسه و فقط شامل حروف انگلیسی کوچک، عدد، نقطه یا زیرخط باشد."]
    candidate = User(username=username, email=email, first_name=first_name, last_name=last_name)
    errors = password_errors(password, candidate)
    if errors:
        fields["password"] = errors
    if not fields:
        if User.objects.filter(username=username).exists():
            fields["username"] = ["این نام کاربری قبلاً استفاده شده است."]
        if User.objects.filter(email=email).exists():
            fields["email"] = ["با این ایمیل قبلاً حساب ساخته شده است. وارد شوید یا رمز عبور را بازیابی کنید."]
    if fields:
        raise ApiError("validation_error", fields=fields)

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                role=Role.CUSTOMER,
            )
            user.password_changed_at = timezone.now()
            user.save(update_fields=["password_changed_at"])
            send_verification_email(user)
    except (IntegrityError, DjangoValidationError):
        # Lost a race with a concurrent signup for the same username/email.
        raise ApiError(
            "validation_error",
            fields={"username": ["این نام کاربری یا ایمیل قبلاً استفاده شده است."]},
        ) from None

    notices = _establish_session(request, user)
    return {**serialize_me(request), "merge_notices": notices, "csrf_token": get_token(request)}


def send_verification_email(user: User, *, to_pending: bool = False) -> None:
    token = email_verification_tokens.make_token(user)
    uid = encode_uid(user)
    target = user.pending_email if to_pending else user.email
    template = "email_change_verify" if to_pending else "verify_email"
    enqueue(
        "email",
        {
            "template": template,
            "to": target,
            "context": {
                "name": user.first_name or user.username,
                "link": f"{settings.PUBLIC_BASE_URL}/verify-email#uid={uid}&token={token}",
                "hours": settings.EMAIL_VERIFICATION_TIMEOUT // 3600,
            },
        },
        dedupe_key=f"verify:{user.pk}:{token}",
    )


def resend_verification(request: Any) -> None:
    user: User = request.user
    ratelimit.enforce("verify_resend.user", str(user.pk))
    if user.pending_email:
        send_verification_email(user, to_pending=True)
    elif not user.email_verified:
        send_verification_email(user)


def confirm_email(user: User | None, token: str) -> User:
    if user is None or not email_verification_tokens.check_token(user, token):
        raise ApiError("invalid_token", "پیوند تأیید نامعتبر است یا منقضی شده است.")
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        if not email_verification_tokens.check_token(locked, token):
            raise ApiError("invalid_token", "پیوند تأیید نامعتبر است یا منقضی شده است.")
        if locked.pending_email:
            new_email = locked.pending_email
            if User.objects.filter(email=new_email).exclude(pk=locked.pk).exists():
                locked.pending_email = ""
                locked.save(update_fields=["pending_email"])
                raise ApiError("email_unavailable", "این ایمیل دیگر قابل استفاده نیست.")
            old_email = locked.email
            locked.email = new_email
            locked.pending_email = ""
            locked.email_verified_at = timezone.now()
            locked.save(update_fields=["email", "pending_email", "email_verified_at"])
            enqueue(
                "email",
                {
                    "template": "password_changed",
                    "to": old_email,
                    "context": {"name": locked.first_name or locked.username, "what": "email"},
                },
                dedupe_key=f"email-changed:{locked.pk}:{int(time.time())}",
            )
        else:
            locked.email_verified_at = timezone.now()
            locked.save(update_fields=["email_verified_at"])
    return locked


def request_password_reset(request: Any, email: str) -> None:
    email = normalize_email(email)
    ratelimit.enforce("password_reset.ip", client_ip(request))
    ratelimit.enforce("password_reset.email", email)
    user = User.objects.filter(email=email, is_active=True).first()
    if user is None:
        return  # identical response; no account enumeration
    token = password_reset_tokens.make_token(user)
    enqueue(
        "email",
        {
            "template": "password_reset",
            "to": user.email,
            "context": {
                "name": user.first_name or user.username,
                "link": f"{settings.PUBLIC_BASE_URL}/reset-password#uid={encode_uid(user)}&token={token}",
                "minutes": settings.PASSWORD_RESET_TIMEOUT // 60,
            },
        },
        dedupe_key=f"reset:{user.pk}:{token}",
    )


def _revoke_sessions(user: User, *, except_key: str | None = None) -> int:
    qs = UserSession.objects.filter(user=user)
    if except_key:
        qs = qs.exclude(session_key=except_key)
    deleted, _ = qs.delete()
    return deleted


def reset_password(request: Any, user: User | None, token: str, new_password: str) -> None:
    ratelimit.enforce("password_reset_confirm.ip", client_ip(request))
    if user is None or not password_reset_tokens.check_token(user, token):
        raise ApiError("invalid_token", "پیوند بازیابی نامعتبر است یا منقضی شده است.")
    errors = password_errors(new_password, user)
    if errors:
        raise ApiError("validation_error", fields={"new_password": errors})
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        if not password_reset_tokens.check_token(locked, token):
            raise ApiError("invalid_token", "پیوند بازیابی نامعتبر است یا منقضی شده است.")
        # password_errors above applies Django's configured password validators.
        locked.set_password(new_password)
        locked.password_changed_at = timezone.now()
        if not locked.email_verified_at:
            # Receiving the reset link proves control of the mailbox.
            locked.email_verified_at = timezone.now()
        locked.save(update_fields=["password", "password_changed_at", "email_verified_at"])
        _revoke_sessions(locked)
        audit.record("auth.password_reset", actor=locked, request=request, obj=locked)
        enqueue(
            "email",
            {
                "template": "password_changed",
                "to": locked.email,
                "context": {"name": locked.first_name or locked.username, "what": "password"},
            },
            dedupe_key=f"pw-changed:{locked.pk}:{locked.password_changed_at.timestamp()}",
        )


def change_password(request: Any, current_password: str, new_password: str) -> None:
    user: User = request.user
    ratelimit.enforce("reauth.user", str(user.pk))
    if not user.check_password(current_password):
        raise ApiError("validation_error", fields={"current_password": ["رمز عبور فعلی نادرست است."]})
    errors = password_errors(new_password, user)
    if errors:
        raise ApiError("validation_error", fields={"new_password": errors})
    # password_errors above applies Django's configured password validators.
    user.set_password(new_password)
    user.password_changed_at = timezone.now()
    user.save(update_fields=["password", "password_changed_at"])
    update_session_auth_hash(request, user)  # also cycles the session key
    _revoke_sessions(user, except_key=request.session.session_key)
    audit.record("auth.password_changed", request=request, obj=user)
    enqueue(
        "email",
        {
            "template": "password_changed",
            "to": user.email,
            "context": {"name": user.first_name or user.username, "what": "password"},
        },
        dedupe_key=f"pw-changed:{user.pk}:{user.password_changed_at.timestamp()}",
    )


def request_email_change(request: Any, password: str, new_email: str) -> None:
    user: User = request.user
    ratelimit.enforce("email_change.user", str(user.pk))
    if not user.check_password(password):
        raise ApiError("validation_error", fields={"password": ["رمز عبور نادرست است."]})
    new_email = normalize_email(new_email)
    if new_email == user.email:
        raise ApiError("validation_error", fields={"new_email": ["این همان ایمیل فعلی شماست."]})
    if User.objects.filter(email=new_email).exists():
        raise ApiError("validation_error", fields={"new_email": ["این ایمیل قابل استفاده نیست."]})
    user.pending_email = new_email
    user.save(update_fields=["pending_email"])
    send_verification_email(user, to_pending=True)
    audit.record("auth.email_change_requested", request=request, obj=user)


def update_profile(user: User, data: dict[str, Any]) -> User:
    fields = []
    for name in ("first_name", "last_name"):
        if name in data:
            setattr(user, name, data[name])
            fields.append(name)
    if "phone" in data:
        if data["phone"]:
            phone = normalize_mobile(data["phone"])
            if not phone:
                raise ApiError("validation_error", fields={"phone": ["شمارهٔ موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)."]})
            user.phone = phone
        else:
            user.phone = ""
        fields.append("phone")
    if fields:
        user.save(update_fields=fields)
    return user


def list_sessions(request: Any) -> list[dict[str, Any]]:
    current = request.session.session_key
    rows = UserSession.objects.filter(user=request.user, expire_date__gt=timezone.now()).order_by("-last_seen_at")[:30]
    return [
        {
            "id": session_id_for(row.session_key),
            "current": row.session_key == current,
            "created_at": row.created_at,
            "last_seen_at": row.last_seen_at,
            "ip_prefix": row.ip_prefix,
            "user_agent": row.user_agent,
        }
        for row in rows
    ]


def revoke_session(request: Any, session_id: str) -> bool:
    for row in UserSession.objects.filter(user=request.user):
        if session_id_for(row.session_key) == session_id:
            if row.session_key == request.session.session_key:
                raise ApiError("cannot_revoke_current", "برای خروج از این دستگاه از گزینهٔ خروج استفاده کنید.")
            row.delete()
            audit.record("auth.session_revoked", request=request, obj=request.user)
            return True
    return False


def revoke_other_sessions(request: Any) -> int:
    count = _revoke_sessions(request.user, except_key=request.session.session_key)
    audit.record("auth.sessions_revoked", request=request, obj=request.user, metadata={"count": count})
    return count


# --- MFA / re-authentication ----------------------------------------------


def mark_mfa_verified(request: Any) -> None:
    request.session.cycle_key()  # privilege elevation -> new session id
    request.session[MFA_SESSION_KEY] = time.time()
    request.session[REAUTH_SESSION_KEY] = time.time()


def verify_mfa(request: Any, code: str | None, recovery_code: str | None) -> None:
    user: User = request.user
    ratelimit.enforce("mfa.user", str(user.pk))
    ok = False
    if code:
        ok = mfa.verify_totp(user, code)
    elif recovery_code:
        ok = mfa.use_recovery_code(user, recovery_code)
        if ok:
            audit.record("auth.mfa_recovery_code_used", request=request, obj=user)
    if not ok:
        audit.record("auth.mfa_failed", request=request, obj=user, result="failed")
        raise ApiError("invalid_mfa_code", "کد تأیید نادرست یا منقضی است.")
    mark_mfa_verified(request)
    audit.record("auth.mfa_verified", request=request, obj=user)


def reauthenticate(request: Any, password: str, code: str) -> None:
    user: User = request.user
    ratelimit.enforce("reauth.user", str(user.pk))
    if not user.check_password(password):
        audit.record("auth.reauth_failed", request=request, obj=user, result="failed")
        raise ApiError("validation_error", fields={"password": ["رمز عبور نادرست است."]})
    if user.is_staff and not mfa_bypass_active() and not mfa.verify_totp(user, code):
        audit.record("auth.reauth_failed", request=request, obj=user, result="failed")
        raise ApiError("validation_error", fields={"code": ["کد تأیید نادرست یا منقضی است."]})
    request.session[REAUTH_SESSION_KEY] = time.time()
    audit.record("auth.reauth", request=request, obj=user)
