"""Authenticate with username OR email.

Normalization strategy (documented): usernames are lowercase ASCII [a-z0-9._] and can never
contain '@'. An identifier containing '@' is therefore always treated as an email (trimmed and
lowercased), anything else as a username (NFKC, trimmed, lowercased). There is no ambiguity.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth.backends import ModelBackend
from django.contrib.auth.hashers import make_password

from apps.core.normalize import normalize_email, normalize_username

from .models import User


class IdentifierBackend(ModelBackend):
    def authenticate(self, request: Any, username: str | None = None, password: str | None = None, **kwargs: Any) -> User | None:  # type: ignore[override]
        identifier = kwargs.get("identifier") or username
        if not identifier or not password:
            return None
        identifier = identifier.strip()
        try:
            if "@" in identifier:
                user = User.objects.get(email=normalize_email(identifier))
            else:
                user = User.objects.get(username=normalize_username(identifier))
        except User.DoesNotExist:
            # Run the hasher anyway to reduce timing differences between existing/missing users.
            make_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None

    def get_user(self, user_id: Any) -> User | None:
        try:
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError):
            return None
        return user if self.user_can_authenticate(user) else None

    # Role-based permissions live in apps.accounts.permissions; no Django model perms.
    def get_all_permissions(self, user_obj: Any, obj: Any = None) -> set[str]:  # type: ignore[override]
        return set()
