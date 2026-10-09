from celery import shared_task
from django.utils import timezone

from .models import UserSession


@shared_task(ignore_result=True)
def cleanup_expired_sessions() -> int:
    deleted, _ = UserSession.objects.filter(expire_date__lt=timezone.now()).delete()
    return deleted
