"""Inventory mutations. Callers must hold row locks obtained via `lock_stock` (consistent
ascending variant-id order to avoid deadlocks) inside a transaction."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from django.db import transaction

from apps.core.errors import ApiError, Conflict

from .models import InventoryMovement, StockLevel


def lock_stock(variant_ids: Iterable[int]) -> dict[int, StockLevel]:
    ids = sorted(set(variant_ids))
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("lock_stock requires an atomic block")
    rows = StockLevel.objects.select_for_update().filter(variant_id__in=ids).order_by("variant_id")
    found = {row.variant_id: row for row in rows}
    missing = [i for i in ids if i not in found]
    if missing:
        # Create absent rows (zero stock) then lock them too.
        for vid in missing:
            StockLevel.objects.get_or_create(variant_id=vid)
        rows = StockLevel.objects.select_for_update().filter(variant_id__in=ids).order_by("variant_id")
        found = {row.variant_id: row for row in rows}
    return found


def _apply(
    stock: StockLevel,
    *,
    kind: str,
    d_on_hand: int = 0,
    d_reserved: int = 0,
    reason: str = "",
    reference: str = "",
    actor: Any = None,
) -> InventoryMovement:
    new_on_hand = stock.on_hand + d_on_hand
    new_reserved = stock.reserved + d_reserved
    if new_on_hand < 0 or new_reserved < 0 or new_reserved > new_on_hand:
        raise Conflict("insufficient_stock", "موجودی کافی نیست.")
    stock.on_hand = new_on_hand
    stock.reserved = new_reserved
    stock.version += 1
    stock.save(update_fields=["on_hand", "reserved", "version", "updated_at"])
    return InventoryMovement.objects.create(
        variant_id=stock.variant_id,
        kind=kind,
        delta_on_hand=d_on_hand,
        delta_reserved=d_reserved,
        on_hand_after=new_on_hand,
        reserved_after=new_reserved,
        reason=reason[:300],
        reference=reference[:64],
        actor=actor if getattr(actor, "pk", None) else None,
    )


def reserve(stock: StockLevel, qty: int, *, reference: str) -> None:
    if qty <= 0:
        raise ValueError("qty must be positive")
    if stock.available < qty:
        raise Conflict("insufficient_stock", "موجودی کافی نیست.")
    _apply(stock, kind=InventoryMovement.Kind.RESERVE, d_reserved=qty, reference=reference)


def release(stock: StockLevel, qty: int, *, reference: str, reason: str = "") -> None:
    _apply(stock, kind=InventoryMovement.Kind.RELEASE, d_reserved=-qty, reference=reference, reason=reason)


def consume_reserved(stock: StockLevel, qty: int, *, reference: str) -> None:
    _apply(stock, kind=InventoryMovement.Kind.SALE, d_on_hand=-qty, d_reserved=-qty, reference=reference)


def take_unreserved(stock: StockLevel, qty: int, *, reference: str, reason: str = "") -> bool:
    """Late-payment path: deduct directly from available stock if possible."""
    if stock.available < qty:
        return False
    _apply(stock, kind=InventoryMovement.Kind.LATE_SALE, d_on_hand=-qty, reference=reference, reason=reason)
    return True


def restock(stock: StockLevel, qty: int, *, kind: str, reference: str, actor: Any = None, reason: str = "") -> None:
    if qty <= 0:
        raise ValueError("qty must be positive")
    _apply(stock, kind=kind, d_on_hand=qty, reference=reference, actor=actor, reason=reason)


def adjust(
    variant_id: int,
    *,
    delta: int,
    reason: str,
    actor: Any,
    expected_version: int | None = None,
    kind: str = InventoryMovement.Kind.ADJUSTMENT,
) -> StockLevel:
    """Staff adjustment of on-hand quantity (audited). Optimistic version check prevents silent
    overwrites when two staff members edit the same SKU."""
    if delta == 0:
        raise ApiError("validation_error", fields={"delta": ["مقدار تغییر نمی‌تواند صفر باشد."]})
    if not reason.strip():
        raise ApiError("validation_error", fields={"reason": ["دلیل تغییر موجودی را بنویسید."]})
    with transaction.atomic():
        stock = lock_stock([variant_id])[variant_id]
        if expected_version is not None and stock.version != expected_version:
            raise Conflict(
                "stale_version",
                "این موجودی در همین فاصله توسط کاربر دیگری تغییر کرده است. صفحه را تازه کنید.",
                extra={"current_version": stock.version},
            )
        if stock.on_hand + delta < stock.reserved:
            raise Conflict(
                "below_reserved",
                f"موجودی نمی‌تواند کمتر از مقدار رزروشده ({stock.reserved}) شود.",
            )
        if kind not in {InventoryMovement.Kind.ADJUSTMENT, InventoryMovement.Kind.RECEIVE}:
            raise ApiError("validation_error", fields={"kind": ["نوع تغییر موجودی معتبر نیست."]})
        if kind == InventoryMovement.Kind.RECEIVE and delta < 0:
            raise ApiError("validation_error", fields={"delta": ["ورود کالا باید مقدار مثبت داشته باشد."]})
        _apply(stock, kind=kind, d_on_hand=delta, reason=reason, actor=actor)
        return stock
