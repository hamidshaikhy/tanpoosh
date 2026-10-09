"""Explicit local visual refresh; preserves existing stock, variants and orders."""

import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.catalog.media import process_upload
from apps.catalog.models import Collection, Product, ProductMedia
from apps.content.models import StoreSettings
from apps.core.revalidate import request_revalidation

from .seed_store import SEED_DIR


class Command(BaseCommand):
    help = "Replace demo imagery/studio assignments and feature the old-money collection."

    def handle(self, *args, **options):
        if settings.IS_PRODUCTION:
            raise CommandError("Demo refresh is development-only.")
        data = json.loads((SEED_DIR / "catalog.json").read_text(encoding="utf-8"))
        missing = [c["image"] for p in data["products"] for c in p["colors"] if not (SEED_DIR / c["image"]).exists()]
        if missing:
            raise CommandError("Missing generated assets: " + ", ".join(missing))
        for row in data["products"]:
            p = Product.objects.filter(slug=row["slug"]).first()
            if not p:
                continue
            p.studio_slot, p.studio_asset = row["studio_slot"], row["studio_asset"]
            p.save(update_fields=["studio_slot", "studio_asset"])
            p.collections.add(Collection.objects.get(slug="old-money")) if "old-money" in row["collections"] else None
            for color in row["colors"]:
                c = p.colors.get(code=color["code"])
                with (SEED_DIR / color["image"]).open("rb") as file:
                    image = process_upload(file)
                media = p.media.filter(color=c, kind="front").first() or ProductMedia(
                    product=p, color=c, kind="front", sort_order=c.sort_order
                )
                media.image.save("image.webp", image.main, save=False)
                media.thumb.save("thumb.webp", image.thumb, save=False)
                media.width, media.height = image.width, image.height
                media.alt_text = p.name + " " + c.name
                media.save()
        s = StoreSettings.load()
        slugs = ["navy-blazer", "knit-polo", "tailored-trousers", "suede-loafers"]
        s.featured_products = [Product.objects.get(slug=slug).pk for slug in slugs]
        s.featured_collection = Collection.objects.get(slug="old-money")
        s.hero_primary_href = "/collections/old-money"
        s.picks_subtitle = "بافت ظریف، برش کلاسیک، انتخابی ماندگار."
        s.save()
        request_revalidation("catalog", "content")
        self.stdout.write("Photoreal demo catalog refreshed; stock and orders preserved.")
