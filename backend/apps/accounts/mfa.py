"""Staff TOTP MFA using the maintained `pyotp` library (RFC 6238), with replay protection
and hashed single-use recovery codes. Secrets are encrypted at rest with Fernet."""

from __future__ import annotations

import hashlib
import hmac
import secrets

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.utils import timezone

from .models import MFADevice, MFARecoveryCode, User

RECOVERY_CODE_COUNT = 10
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _fernet() -> Fernet:
    key = settings.MFA_ENCRYPTION_KEY
    if not key:
        raise ImproperlyConfigured("MFA_ENCRYPTION_KEY is not configured")
    return Fernet(key.encode() if isinstance(key, str) else key)


def _encrypt(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def _decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:  # key rotated without re-enrollment
        raise ImproperlyConfigured("Cannot decrypt MFA secret (wrong MFA_ENCRYPTION_KEY?)") from exc


def start_enrollment(user: User) -> tuple[str, str]:
    """Create (or replace an unconfirmed) device. Returns (base32 secret, otpauth URI)."""
    secret = pyotp.random_base32(length=32)
    with transaction.atomic():
        device = MFADevice.objects.select_for_update().filter(user=user).first()
        if device and device.confirmed:
            raise ValueError("already_enrolled")
        if device:
            device.secret_encrypted = _encrypt(secret)
            device.last_used_step = 0
            device.save(update_fields=["secret_encrypted", "last_used_step"])
        else:
            MFADevice.objects.create(user=user, secret_encrypted=_encrypt(secret))
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.username, issuer_name=settings.MFA_ISSUER)
    return secret, uri


def _normalize_code(code: str) -> str:
    from apps.core.normalize import to_ascii_digits

    return "".join(ch for ch in to_ascii_digits(code or "") if ch.isalnum()).upper()


def verify_totp(user: User, code: str, *, require_confirmed: bool = True) -> bool:
    code = _normalize_code(code)
    if not (len(code) == 6 and code.isdigit()):
        return False
    with transaction.atomic():
        device = MFADevice.objects.select_for_update().filter(user=user).first()
        if device is None or (require_confirmed and not device.confirmed):
            return False
        totp = pyotp.TOTP(_decrypt(device.secret_encrypted))
        now_step = totp.timecode(timezone.now())
        for offset in (0, -1, 1):
            step = now_step + offset
            if hmac.compare_digest(totp.generate_otp(step), code):
                if step <= device.last_used_step:
                    return False  # replayed code
                device.last_used_step = step
                device.save(update_fields=["last_used_step"])
                return True
    return False


def confirm_enrollment(user: User, code: str) -> list[str] | None:
    if not verify_totp(user, code, require_confirmed=False):
        return None
    with transaction.atomic():
        device = MFADevice.objects.select_for_update().get(user=user)
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at"])
        return regenerate_recovery_codes(user)


def _hash_code(code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), _normalize_code(code).encode(), hashlib.sha256).hexdigest()


def regenerate_recovery_codes(user: User) -> list[str]:
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(_ALPHABET) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    with transaction.atomic():
        MFARecoveryCode.objects.filter(user=user).delete()
        MFARecoveryCode.objects.bulk_create([MFARecoveryCode(user=user, code_hash=_hash_code(c)) for c in codes])
    return codes


def use_recovery_code(user: User, code: str) -> bool:
    if not code or len(code) > 40:
        return False
    updated = MFARecoveryCode.objects.filter(user=user, code_hash=_hash_code(code), used_at__isnull=True).update(
        used_at=timezone.now()
    )
    return updated == 1


def remaining_recovery_codes(user: User) -> int:
    return MFARecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


def disable(user: User) -> None:
    with transaction.atomic():
        MFADevice.objects.filter(user=user).delete()
        MFARecoveryCode.objects.filter(user=user).delete()


def is_enrolled(user: User) -> bool:
    return MFADevice.objects.filter(user=user, confirmed_at__isnull=False).exists()
