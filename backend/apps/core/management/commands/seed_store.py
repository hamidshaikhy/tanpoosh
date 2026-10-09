"""Idempotent development/demo seed: categories, collections, products (+ images, variants,
initial stock), shipping methods, the TAN10 demo coupon, store settings and info pages.

* Creates only what is missing. Existing rows (possibly edited by the owner) are never
  overwritten, stock is never reset, and no orders/payments/users are created.
* Never creates or touches owner credentials (see `bootstrap_owner`).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.catalog.media import process_upload
from apps.catalog.models import Category, Collection, Product, ProductColor, ProductMedia, Variant
from apps.content.models import InfoPage, StoreSettings
from apps.inventory.models import InventoryMovement, StockLevel
from apps.orders.models import ShippingMethod
from apps.promotions.models import Coupon

SEED_DIR = Path(settings.BASE_DIR) / "fixtures" / "seed"
COLOR_ABBR = {
    "black": "BLK",
    "olive": "OLV",
    "grey": "GRY",
    "ivory": "IVR",
    "charcoal": "CHR",
    "light-grey": "LGR",
    "brown": "BRN",
    "khaki": "KHK",
    "sand": "SND",
    "navy": "NVY",
    "ecru": "ECR",
    "white": "WHT",
    "sky": "SKY",
    "oatmeal": "OAT",
    "indigo": "IND",
}


class Command(BaseCommand):
    help = "Seed demo catalog/content (idempotent; never overwrites existing data)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--skip-images", action="store_true", help="Create products without images (tests).")

    def handle(self, *args: Any, **options: Any) -> None:
        if settings.IS_PRODUCTION:
            raise CommandError("Demo catalog seeding is disabled in production.")
        data = json.loads((SEED_DIR / "catalog.json").read_text(encoding="utf-8"))
        pages = json.loads((SEED_DIR / "pages.json").read_text(encoding="utf-8"))
        with transaction.atomic():
            cats = self._categories(data["categories"])
            cols = self._collections(data["collections"])
            self._shipping(data["shipping_methods"])
            self._coupons(data["coupons"])
            created = self._products(data["products"], cats, cols, skip_images=options["skip_images"])
            self._settings()
            self._pages(pages)
        self.stdout.write(self.style.SUCCESS(f"Seed complete. New products: {created}."))

    def _categories(self, rows: list[dict[str, Any]]) -> dict[str, Category]:
        out = {}
        for row in rows:
            obj, _ = Category.objects.get_or_create(slug=row["slug"], defaults={k: v for k, v in row.items() if k != "slug"})
            out[row["slug"]] = obj
        return out

    def _collections(self, rows: list[dict[str, Any]]) -> dict[str, Collection]:
        out = {}
        for row in rows:
            obj, _ = Collection.objects.get_or_create(slug=row["slug"], defaults={k: v for k, v in row.items() if k != "slug"})
            out[row["slug"]] = obj
        return out

    def _shipping(self, rows: list[dict[str, Any]]) -> None:
        for row in rows:
            ShippingMethod.objects.get_or_create(code=row["code"], defaults={k: v for k, v in row.items() if k != "code"})

    def _coupons(self, rows: list[dict[str, Any]]) -> None:
        for row in rows:
            Coupon.objects.get_or_create(code=row["code"], defaults={k: v for k, v in row.items() if k != "code"})

    def _products(
        self, rows: list[dict[str, Any]], cats: dict[str, Category], cols: dict[str, Collection], *, skip_images: bool
    ) -> int:
        created = 0
        for row in rows:
            if Product.objects.filter(slug=row["slug"]).exists():
                continue
            product = Product.objects.create(
                slug=row["slug"],
                name=row["name"],
                category=cats[row["category"]],
                status=Product.Status.PUBLISHED,
                published_at=timezone.now(),
                short_description=row["short_description"],
                description=row["description"],
                materials=row["materials"],
                care=row["care"],
                fit_notes=row["fit_notes"],
                size_chart=row["size_chart"],
                is_new=row["is_new"],
                studio_slot=row["studio_slot"],
                studio_asset=row["studio_asset"],
                sort_order=row["sort_order"],
            )
            product.collections.set([cols[c] for c in row["collections"]])
            overrides = row["stock"].get("overrides", {})
            for ci, color in enumerate(row["colors"]):
                c = ProductColor.objects.create(
                    product=product, code=color["code"], name=color["name"], hex=color["hex"], sort_order=ci
                )
                for si, size in enumerate(row["sizes"]):
                    v = Variant.objects.create(
                        product=product,
                        color=c,
                        size=size,
                        sku=f"TP-{row['sku']}-{COLOR_ABBR.get(color['code'], color['code'][:3].upper())}-{size}",
                        price_toman=row["price_toman"],
                        sort_order=ci * 10 + si,
                    )
                    qty = int(overrides.get(f"{color['code']}:{size}", row["stock"]["default"]))
                    StockLevel.objects.create(variant=v, on_hand=qty)
                    if qty:
                        InventoryMovement.objects.create(
                            variant=v,
                            kind=InventoryMovement.Kind.SEED,
                            delta_on_hand=qty,
                            on_hand_after=qty,
                            reserved_after=0,
                            reason="موجودی اولیهٔ دادهٔ نمونه",
                        )
                if not skip_images:
                    path = (
                        SEED_DIR / color["image"]
                        if color["image"].startswith("photoreal/")
                        else SEED_DIR / "images" / color["image"]
                    )
                    if not path.exists():
                        raise CommandError(f"Missing seed image {path}")
                    with path.open("rb") as fh:
                        processed = process_upload(fh)
                    media = ProductMedia(
                        product=product,
                        color=c,
                        kind=ProductMedia.Kind.FRONT,
                        alt_text=f"{row['name']} {color['name']}",
                        width=processed.width,
                        height=processed.height,
                        sort_order=ci,
                    )
                    media.image.save("image.webp", processed.main, save=False)
                    media.thumb.save("thumb.webp", processed.thumb, save=False)
                    media.save()
            product.rebuild_search_text()
            product.save(update_fields=["search_text"])
            created += 1
            self.stdout.write(f"  + {row['slug']}")
        return created

    def _settings(self) -> None:
        s = StoreSettings.load()
        if not s.featured_products:
            ids = list(
                Product.objects.filter(slug__in=["bomber-jacket", "basic-tee", "tailored-trousers", "chelsea-boots"]).values_list(
                    "slug", "id"
                )
            )
            order = {"bomber-jacket": 0, "basic-tee": 1, "tailored-trousers": 2, "chelsea-boots": 3}
            s.featured_products = [pid for _, pid in sorted(ids, key=lambda x: order[x[0]])]
            if s.featured_collection_id is None:
                s.featured_collection = Collection.objects.filter(slug="autumn-1405").first()
            s.save()

    def _pages(self, pages: list[dict[str, Any]]) -> None:
        for p in pages:
            InfoPage.objects.get_or_create(
                slug=p["slug"],
                defaults={"title": p["title"], "summary": p["summary"], "blocks": p["blocks"], "is_seed_content": True},
            )
