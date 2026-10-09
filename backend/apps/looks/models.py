from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class SavedLook(models.Model):
    """A studio outfit saved to a customer account.

    `items` is a validated list of {"slot", "product_id", "color_code", "size"}. Private by
    default; sharing creates a high-entropy token exposing only the clothing selection.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="looks")
    name = models.CharField(max_length=60)
    items = models.JSONField(default=list)
    share_token = models.CharField(max_length=43, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"SavedLook: {self.pk}"
