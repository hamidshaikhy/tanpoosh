from celery import shared_task

from .services import expire_due_orders


@shared_task(ignore_result=True)
def expire_reservations() -> int:
    """Periodic safety net; expiry is also enforced on checkout/payment actions."""
    return expire_due_orders()
