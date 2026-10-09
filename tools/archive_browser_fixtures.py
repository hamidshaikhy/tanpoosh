"""Archive only products created by our explicitly named browser-test owner."""

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
import django

django.setup()
from django.conf import settings

from apps.accounts.models import User
from apps.catalog.manage_services import change_status
from apps.catalog.models import Product

if settings.IS_PRODUCTION:
    raise SystemExit("Browser fixtures may only be archived in development.")
owner = User.objects.filter(username="tp_e2e_owner").first()
count = 0
if owner:
    for product in Product.objects.filter(created_by=owner).exclude(status="archived"):
        if re.fullmatch(r"browser-[0-9a-f]{8}", product.slug):
            change_status(product, "archive", version=product.version, actor=owner)
            count += 1
print(f"Archived {count} browser fixture products; orders and audit history retained.")
