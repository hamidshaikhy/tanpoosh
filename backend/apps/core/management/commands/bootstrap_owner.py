"""Explicitly create the first store owner. Never runs implicitly (not part of migrate/seed).

Local development:
    python manage.py bootstrap_owner --generate
        -> creates `OWNER_USERNAME` (default tanpoosh_admin) with a strong random password, stores
           only the Django password hash, prints the password ONCE to this terminal and writes it
           to backend/.local-credentials/owner.txt (git-ignored, owner-only permissions).

Production (operator supplies the secret; no defaults, no file output):
    OWNER_BOOTSTRAP_PASSWORD=... python manage.py bootstrap_owner --email owner@example.com --password-from-env
    python manage.py bootstrap_owner --email owner@example.com            (interactive prompt)

Refuses to touch an existing account. Use `set_staff_password` to rotate credentials.
"""

from __future__ import annotations

import contextlib
import getpass
import os
import secrets
import stat
import string
from typing import Any

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.core.normalize import is_valid_username, normalize_email, normalize_username


def generate_password(length: int = 24) -> str:
    alphabet = string.ascii_letters + string.digits + "-_.@#%"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isdigit() for c in pw) and any(c.isupper() for c in pw) and any(c.islower() for c in pw):
            return pw


def write_local_credentials(username: str, password: str) -> str:
    directory = settings.LOCAL_CREDENTIALS_DIR
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "owner.txt"
    content = (
        "TANPOOSH local owner credentials (development only — do not commit or share)\n"
        f"username: {username}\npassword: {password}\nlogin: {settings.PUBLIC_BASE_URL}/manage/login\n"
        "After first login you must enrol two-factor authentication (TOTP) unless MFA_DEV_BYPASS=true.\n"
    )
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(content)
    with contextlib.suppress(OSError):
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    return str(path)


class Command(BaseCommand):
    help = "Create the first store owner account (explicit, one-time)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--username", default=None)
        parser.add_argument("--email", default=None)
        parser.add_argument("--generate", action="store_true", help="Generate a random password (development only).")
        parser.add_argument("--password-from-env", action="store_true", help="Read OWNER_BOOTSTRAP_PASSWORD.")

    def handle(self, *args: Any, **opts: Any) -> None:
        username = normalize_username(opts["username"] or settings.OWNER_USERNAME)
        if not is_valid_username(username):
            raise CommandError("Invalid username format.")
        email = normalize_email(opts["email"] or f"{username}@tanpoosh.local")
        if settings.IS_PRODUCTION and (not opts["email"] or email.endswith(".local")):
            raise CommandError("Production requires a real --email for the owner.")
        if User.objects.filter(username=username).exists():
            raise CommandError(f"User {username!r} already exists. Use `set_staff_password` to rotate its password.")
        if User.objects.filter(email=email).exists():
            raise CommandError("Email already in use.")

        generated = False
        if opts["generate"]:
            if settings.IS_PRODUCTION:
                raise CommandError("--generate is for local development; in production supply the secret.")
            password = generate_password()
            generated = True
        elif opts["password_from_env"]:
            password = os.environ.get("OWNER_BOOTSTRAP_PASSWORD", "")
            if not password:
                raise CommandError("OWNER_BOOTSTRAP_PASSWORD is empty.")
        else:
            password = getpass.getpass("Owner password: ")
            if password != getpass.getpass("Repeat password: "):
                raise CommandError("Passwords do not match.")

        candidate = User(username=username, email=email)
        try:
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError("Weak password: " + " ".join(exc.messages)) from None

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            role=Role.OWNER,
            first_name="مالک",
            last_name="فروشگاه",
        )
        user.email_verified_at = timezone.now()
        user.password_changed_at = timezone.now()
        user.save(update_fields=["email_verified_at", "password_changed_at"])

        from apps.core import audit

        audit.record("staff.owner_bootstrap", obj=user, metadata={"generated": generated})
        self.stdout.write(self.style.SUCCESS(f"Owner account created: {username}"))
        if generated:
            path = write_local_credentials(username, password)
            self.stdout.write("Local one-time password (shown once; also saved privately):")
            self.stdout.write(f"  {password}")
            self.stdout.write(f"Saved to {path} (git-ignored).")
