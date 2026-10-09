from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import Cart


@shared_task(ignore_result=True)
def cleanup_stale_guest_carts() -> int:
    cutoff = timezone.now() - timedelta(days=settings.GUEST_CART_RETENTION_DAYS)
    deleted, _ = Cart.objects.filter(user__isnull=True, updated_at__lt=cutoff).delete()
    return deleted
