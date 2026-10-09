"""Remove a staff member's TOTP device + recovery codes (they must re-enrol at next login).
Operator recovery path when the last owner lost their authenticator."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from apps.accounts import mfa
from apps.accounts.models import User, UserSession
from apps.core import audit
from apps.core.normalize import normalize_username


class Command(BaseCommand):
    help = "Reset two-factor authentication for a staff account."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--username", required=True)
        parser.add_argument("--yes", action="store_true", help="Confirm without prompt.")

    def handle(self, *args: Any, **opts: Any) -> None:
        user = User.objects.filter(username=normalize_username(opts["username"])).first()
        if user is None or not user.is_staff:
            raise CommandError("Staff user not found.")
        if not opts["yes"] and input(f"Reset MFA for {user.username}? [y/N] ").strip().lower() != "y":
            raise CommandError("Aborted.")
        mfa.disable(user)
        UserSession.objects.filter(user=user).delete()
        audit.record("staff.mfa_reset_cli", obj=user)
        self.stdout.write(self.style.SUCCESS(f"MFA reset for {user.username}. They must enrol again at next login."))
