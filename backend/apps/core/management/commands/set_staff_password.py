"""Rotate/recover a staff member's password (authorized operator with shell access only).

    python manage.py set_staff_password --username tanpoosh_admin            (interactive)
    python manage.py set_staff_password --username tanpoosh_admin --generate (development only)

All existing sessions of that user are revoked. Plaintext passwords are never stored or shown
anywhere else (the admin UI cannot view or recover passwords).
"""

from __future__ import annotations

import getpass
from typing import Any

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import User, UserSession
from apps.core import audit
from apps.core.normalize import normalize_username

from .bootstrap_owner import generate_password, write_local_credentials


class Command(BaseCommand):
    help = "Set a new password for a staff account and revoke its sessions."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--username", required=True)
        parser.add_argument("--generate", action="store_true")

    def handle(self, *args: Any, **opts: Any) -> None:
        user = User.objects.filter(username=normalize_username(opts["username"])).first()
        if user is None or not user.is_staff:
            raise CommandError("Staff user not found.")
        if opts["generate"]:
            if settings.IS_PRODUCTION:
                raise CommandError("--generate is for local development only.")
            password = generate_password()
        else:
            password = getpass.getpass("New password: ")
            if password != getpass.getpass("Repeat: "):
                raise CommandError("Passwords do not match.")
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            raise CommandError("Weak password: " + " ".join(exc.messages)) from None
        user.set_password(password)
        user.password_changed_at = timezone.now()
        user.save(update_fields=["password", "password_changed_at"])
        revoked, _ = UserSession.objects.filter(user=user).delete()
        audit.record("staff.password_rotated_cli", obj=user, metadata={"sessions_revoked": revoked})
        self.stdout.write(self.style.SUCCESS(f"Password updated for {user.username}; sessions revoked: {revoked}."))
        if opts["generate"]:
            path = write_local_credentials(user.username, password) if user.is_owner else None
            self.stdout.write(f"  New password: {password}")
            if path:
                self.stdout.write(f"  Saved to {path} (git-ignored).")
