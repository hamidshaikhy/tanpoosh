from celery import shared_task

from .services import reconcile_due


@shared_task(ignore_result=True)
def reconcile_payments() -> int:
    return reconcile_due()
