"""Run the periodic maintenance jobs once (useful without a scheduler, and in runbooks):
expire unpaid reservations, reconcile unresolved payments, dispatch pending outbox events."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from apps.core.tasks import dispatch_pending_outbox
from apps.orders.services import expire_due_orders
from apps.payments.services import reconcile_due


class Command(BaseCommand):
    help = "Expire reservations, reconcile payments and flush the outbox once."

    def handle(self, *args: Any, **opts: Any) -> None:
        self.stdout.write(f"expired orders: {expire_due_orders()}")
        self.stdout.write(f"reconciled attempts: {reconcile_due()}")
        self.stdout.write(f"outbox dispatched: {dispatch_pending_outbox()}")
