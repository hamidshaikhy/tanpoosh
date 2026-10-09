"""Explicit development-only test identities; never touches the owner's account."""

import json
import os
import secrets
from pathlib import Path

import pyotp
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts import mfa
from apps.accounts.models import MFADevice, Role, User
from apps.catalog.models import Variant
from apps.inventory import services as inventory


class Command(BaseCommand):
    help = "Prepare isolated browser-test users; secrets go only to an ignored file."

    def handle(self, *args, **options):
        if settings.IS_PRODUCTION or os.environ.get("E2E_SETUP_ENABLED") != "true":
            raise CommandError("E2E identities require development and E2E_SETUP_ENABLED=true.")
        target = Path(settings.LOCAL_CREDENTIALS_DIR) / "e2e.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        stored = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
        out = {}
        for role in Role.values:
            username = "tp_e2e_" + role
            password = stored.get(role, {}).get("password") or secrets.token_urlsafe(24)
            user, _ = User.objects.get_or_create(username=username, defaults={"email": f"{username}@example.com", "role": role})
            validate_password(password, user)
            user.set_password(password)
            user.role = role
            user.email_verified_at = timezone.now()
            user.is_active = True
            user.first_name = "کاربر آزمایش"
            user.save()
            secret = stored.get(role, {}).get("secret") or pyotp.random_base32()
            if role != Role.CUSTOMER:
                MFADevice.objects.update_or_create(
                    user=user,
                    defaults={"secret_encrypted": mfa._encrypt(secret), "confirmed_at": timezone.now(), "last_used_step": 0},
                )
            out[role] = {"username": username, "password": password, "secret": secret, "email": user.email}
        target.write_text(json.dumps(out, indent=2), encoding="utf-8")
        # Preserve the ledger and existing orders while replenishing only demo SKUs
        # consumed by browser tests. Never overwrite reservations or user inventory.
        actor = User.objects.get(username="tp_e2e_owner")
        for variant in Variant.objects.select_related("stock").filter(
            product__slug__in=["tortoise-sunglasses", "navy-blazer", "oxford-shirt", "tailored-trousers", "derby-shoes"]
        ):
            if variant.stock.available < 20:
                inventory.adjust(variant.pk, delta=40 - variant.stock.available, reason="Browser test fixture stock", actor=actor)
        if os.name != "nt":
            target.chmod(0o600)
        self.stdout.write("Browser test identities prepared; credentials remain in the ignored local file.")
