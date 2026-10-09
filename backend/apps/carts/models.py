from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Cart(models.Model):
    """A shopping bag. Authenticated carts belong to a user (one active cart per user);
    guest carts are reachable only through the server-side session that created them
    (the id is never accepted from the client)."""

    class Status(models.TextChoices):
        ACTIVE = "active", "فعال"
        MERGED = "merged", "ادغام‌شده"
        ABANDONED = "abandoned", "رهاشده"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="carts")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    merged_into = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user"], condition=Q(status="active") & Q(user__isnull=False), name="one_active_cart_per_user"
            )
        ]

    def __str__(self) -> str:
        return f"Cart: {self.pk}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.CASCADE, related_name="+")
    quantity = models.PositiveSmallIntegerField()
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["added_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["cart", "variant"], name="uniq_cart_variant"),
            models.CheckConstraint(condition=Q(quantity__gte=1) & Q(quantity__lte=10), name="cart_item_qty_bounds"),
        ]

    def __str__(self) -> str:
        return f"CartItem: {self.pk}"


class WishlistItem(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist")
    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="+")
    color_code = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["user", "product"], name="uniq_wishlist_product")]

    def __str__(self) -> str:
        return f"WishlistItem: {self.pk}"
