"""Stateless, expiring, purpose-bound HMAC tokens (same construction as Django's
PasswordResetTokenGenerator, with an explicit timeout per purpose).

Single-use comes from binding the token to mutable user state: a password-reset token embeds
the password hash (changes on reset); an email-verification token embeds the verification
state and target address (changes once verified).
"""

from __future__ import annotations

import time

from django.conf import settings
from django.utils.crypto import constant_time_compare, salted_hmac
from django.utils.encoding import force_bytes, force_str
from django.utils.http import base36_to_int, int_to_base36, urlsafe_base64_decode, urlsafe_base64_encode

from .models import User


class _PurposeTokenGenerator:
    key_salt = ""

    def timeout(self) -> int:
        raise NotImplementedError

    def state(self, user: User) -> str:
        raise NotImplementedError

    def _make(self, user: User, ts: int) -> str:
        value = f"{user.pk}|{self.state(user)}|{ts}"
        digest = salted_hmac(self.key_salt, value, secret=settings.SECRET_KEY, algorithm="sha256").hexdigest()
        return f"{int_to_base36(ts)}-{digest[::2]}"

    def make_token(self, user: User) -> str:
        return self._make(user, int(time.time()))

    def check_token(self, user: User | None, token: str | None) -> bool:
        if user is None or not token or len(token) > 100:
            return False
        try:
            ts_b36, _ = token.split("-", 1)
            ts = base36_to_int(ts_b36)
        except ValueError:
            return False
        if not constant_time_compare(self._make(user, ts), token):
            return False
        age = int(time.time()) - ts
        return 0 <= age <= self.timeout()


class PasswordResetTokens(_PurposeTokenGenerator):
    key_salt = "tanpoosh.accounts.password-reset"

    def timeout(self) -> int:
        return settings.PASSWORD_RESET_TIMEOUT

    def state(self, user: User) -> str:
        login_ts = user.last_login.replace(microsecond=0, tzinfo=None).isoformat() if user.last_login else ""
        return f"{user.password}|{login_ts}|{user.email}|{user.is_active}"


class EmailVerificationTokens(_PurposeTokenGenerator):
    key_salt = "tanpoosh.accounts.email-verify"

    def timeout(self) -> int:
        return settings.EMAIL_VERIFICATION_TIMEOUT

    def state(self, user: User) -> str:
        verified = user.email_verified_at.isoformat() if user.email_verified_at else ""
        return f"{user.email}|{verified}|{user.pending_email}"


password_reset_tokens = PasswordResetTokens()
email_verification_tokens = EmailVerificationTokens()


def encode_uid(user: User) -> str:
    return urlsafe_base64_encode(force_bytes(str(user.pk)))


def decode_uid(uidb64: str) -> User | None:
    if not uidb64 or len(uidb64) > 80:
        return None
    try:
        pk = force_str(urlsafe_base64_decode(uidb64))
        return User.objects.get(pk=pk)
    except (ValueError, TypeError, OverflowError, User.DoesNotExist, Exception):  # noqa: BLE001
        return None
