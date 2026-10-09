from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q


class Review(models.Model):
    """Customer product review. Only purchasers of a delivered order may write one; only
    approved reviews are public and count toward the rating aggregate. Staff can moderate
    but there is no API for staff to author reviews on behalf of customers."""

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار بررسی"
        APPROVED = "approved", "تأییدشده"
        REJECTED = "rejected", "ردشده"

    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    order_item = models.ForeignKey("orders.OrderItem", null=True, on_delete=models.SET_NULL, related_name="+")
    rating = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=80, blank=True)
    body = models.TextField(max_length=2000)
    size_feedback = models.CharField(max_length=10, blank=True)  # small | true | large
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    moderation_note = models.CharField(max_length=300, blank=True)
    moderated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    moderated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["product", "user"], name="uniq_review_per_product_user"),
            models.CheckConstraint(condition=Q(rating__gte=1) & Q(rating__lte=5), name="review_rating_bounds"),
        ]

    def __str__(self) -> str:
        return f"Review: {self.pk}"
