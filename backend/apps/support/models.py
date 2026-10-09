from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class SupportMessage(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "باز"
        IN_PROGRESS = "in_progress", "در حال پیگیری"
        CLOSED = "closed", "بسته"

    class Topic(models.TextChoices):
        ORDER = "order", "پیگیری سفارش"
        PRODUCT = "product", "سؤال دربارهٔ محصول"
        SIZE = "size", "راهنمای سایز"
        RETURN = "return", "مرجوعی و بازپرداخت"
        PAYMENT = "payment", "پرداخت"
        OTHER = "other", "سایر"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="support_messages"
    )
    name = models.CharField(max_length=120)
    email = models.EmailField(max_length=254)
    topic = models.CharField(max_length=10, choices=Topic.choices, default=Topic.OTHER)
    subject = models.CharField(max_length=120)
    body = models.TextField(max_length=3000)
    order_number = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN, db_index=True)
    staff_note = models.TextField(max_length=2000, blank=True)
    ip_hash = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"SupportMessage: {self.pk}"


class SupportReply(models.Model):
    message = models.ForeignKey(SupportMessage, on_delete=models.CASCADE, related_name="replies")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    author_label = models.CharField(max_length=80)
    body = models.TextField(max_length=3000)
    emailed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"SupportReply: {self.pk}"
