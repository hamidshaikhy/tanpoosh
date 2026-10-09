"""Cart application services.

Ownership: authenticated carts are looked up by request.user; guest carts only via the id
stored in the server-side session. A cart id is never accepted from the client.
Cart quantities do not reserve stock; stock is reserved only at order placement.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction

from apps.catalog.models import Product, Variant
from apps.core.errors import ApiError, Conflict

from .models import Cart, CartItem

MAX_QTY = settings.CART_MAX_LINE_QUANTITY


def _available(variant: Variant) -> int:
    stock = getattr(variant, "stock", None)
    return max(0, stock.on_hand - stock.reserved) if stock else 0


def get_cart(request: Any, *, create: bool = False, lock: bool = False) -> Cart | None:
    user = request.user
    qs = Cart.objects.select_for_update() if lock else Cart.objects.all()
    if user.is_authenticated:
        cart = qs.filter(user=user, status=Cart.Status.ACTIVE).first()
        if cart is None and create:
            try:
                with transaction.atomic():
                    cart = Cart.objects.create(user=user)
            except IntegrityError:
                cart = qs.get(user=user, status=Cart.Status.ACTIVE)
        return cart
    cart_id = request.session.get("cart_id")
    cart = qs.filter(pk=cart_id, user__isnull=True, status=Cart.Status.ACTIVE).first() if cart_id else None
    if cart is None and create:
        cart = Cart.objects.create()
        request.session["cart_id"] = str(cart.pk)
    return cart


def _bump(cart: Cart) -> None:
    Cart.objects.filter(pk=cart.pk).update(version=cart.version + 1)
    cart.version += 1


def _check_version(cart: Cart, version: int | None) -> None:
    if version is not None and version != cart.version:
        raise Conflict(
            "stale_cart",
            "سبد خرید در صفحهٔ دیگری تغییر کرده است. سبد به‌روز شد؛ دوباره بررسی کنید.",
            extra={"cart_version": cart.version},
        )


def _load_variant(variant_id: int) -> Variant:
    variant = Variant.objects.select_related("product", "stock", "color").filter(pk=variant_id).first()
    if variant is None or not variant.is_active or variant.product.status != Product.Status.PUBLISHED:
        raise ApiError("variant_unavailable", "این کالا در دسترس نیست.", status_code=404)
    return variant


def add_item(request: Any, variant_id: int, quantity: int) -> Cart:
    if not 1 <= quantity <= MAX_QTY:
        raise ApiError("validation_error", fields={"quantity": [f"تعداد باید بین ۱ و {MAX_QTY} باشد."]})
    with transaction.atomic():
        cart = get_cart(request, create=True, lock=True)
        if cart is None:
            raise RuntimeError("Cart creation did not return a cart")
        variant = _load_variant(variant_id)
        item = CartItem.objects.select_for_update().filter(cart=cart, variant=variant).first()
        current = item.quantity if item else 0
        desired = current + quantity
        if desired > MAX_QTY:
            raise Conflict("quantity_limit", f"حداکثر {MAX_QTY} عدد از هر کالا قابل خرید است.")
        available = _available(variant)
        if available < desired:
            raise Conflict(
                "insufficient_stock",
                "موجودی این سایز کافی نیست." if available else "این سایز ناموجود است.",
                extra={"available": available},
            )
        if item is None and cart.items.count() >= settings.CART_MAX_LINES:
            raise Conflict("cart_full", "تعداد اقلام سبد خرید به حداکثر رسیده است.")
        if item:
            item.quantity = desired
            item.save(update_fields=["quantity", "updated_at"])
        else:
            CartItem.objects.create(cart=cart, variant=variant, quantity=quantity)
        _bump(cart)
        return cart


def add_items_batch(request: Any, lines: list[dict[str, int]]) -> Cart:
    """All-or-nothing add (used by 'Add look to bag'). Validates every line before mutating."""
    if not lines or len(lines) > 8:
        raise ApiError("validation_error", fields={"items": ["تعداد اقلام معتبر نیست."]})
    merged: dict[int, int] = {}
    for line in lines:
        merged[line["variant_id"]] = merged.get(line["variant_id"], 0) + line["quantity"]
    with transaction.atomic():
        cart = get_cart(request, create=True, lock=True)
        if cart is None:
            raise RuntimeError("Cart creation did not return a cart")
        existing = {i.variant_id: i for i in CartItem.objects.select_for_update().filter(cart=cart)}
        variants = {v.pk: v for v in Variant.objects.select_related("product", "stock", "color").filter(pk__in=list(merged))}
        errors: dict[str, list[str]] = {}
        for vid, qty in merged.items():
            v = variants.get(vid)
            key = f"variant_{vid}"
            if v is None or not v.is_active or v.product.status != Product.Status.PUBLISHED:
                errors[key] = ["این کالا در دسترس نیست."]
                continue
            desired = qty + (existing[vid].quantity if vid in existing else 0)
            if desired > MAX_QTY:
                errors[key] = [f"حداکثر {MAX_QTY} عدد از «{v.product.name}» قابل خرید است."]
            elif _available(v) < desired:
                errors[key] = [f"موجودی «{v.product.name}» در سایز {v.size} کافی نیست."]
        new_lines = [vid for vid in merged if vid not in existing]
        if len(existing) + len(new_lines) > settings.CART_MAX_LINES:
            errors["items"] = ["تعداد اقلام سبد خرید به حداکثر رسیده است."]
        if errors:
            raise Conflict("batch_invalid", "برخی اقلام قابل افزودن نیستند؛ سبد خرید تغییری نکرد.", fields=errors)
        for vid, qty in merged.items():
            if vid in existing:
                existing[vid].quantity += qty
                existing[vid].save(update_fields=["quantity", "updated_at"])
            else:
                CartItem.objects.create(cart=cart, variant_id=vid, quantity=qty)
        _bump(cart)
        return cart


def update_item(request: Any, item_id: int, quantity: int, version: int | None) -> Cart:
    if not 1 <= quantity <= MAX_QTY:
        raise ApiError("validation_error", fields={"quantity": [f"تعداد باید بین ۱ و {MAX_QTY} باشد."]})
    with transaction.atomic():
        cart = get_cart(request, lock=True)
        item = (
            CartItem.objects.select_for_update()
            .filter(pk=item_id, cart=cart)
            .select_related("variant__stock", "variant__product")
            .first()
            if cart
            else None
        )
        if cart is None or item is None:
            raise ApiError("not_found", "این قلم در سبد شما نیست.", status_code=404)
        _check_version(cart, version)
        if quantity > item.quantity and _available(item.variant) < quantity:
            raise Conflict("insufficient_stock", "موجودی کافی نیست.", extra={"available": _available(item.variant)})
        item.quantity = quantity
        item.save(update_fields=["quantity", "updated_at"])
        _bump(cart)
        return cart


def remove_item(request: Any, item_id: int) -> Cart | None:
    with transaction.atomic():
        cart = get_cart(request, lock=True)
        if cart is None:
            raise ApiError("not_found", "این قلم در سبد شما نیست.", status_code=404)
        deleted, _ = CartItem.objects.filter(pk=item_id, cart=cart).delete()
        if not deleted:
            raise ApiError("not_found", "این قلم در سبد شما نیست.", status_code=404)
        _bump(cart)
        return cart


def clear(request: Any) -> None:
    with transaction.atomic():
        cart = get_cart(request, lock=True)
        if cart:
            cart.items.all().delete()
            _bump(cart)


def merge_guest_cart(request: Any, user: Any, guest_cart_id: str | None) -> list[dict[str, Any]]:
    """Atomically merge the session's guest cart into the user's active cart.

    Distinct variants are moved; identical variants are summed but capped at available stock
    and the per-line maximum. Each reduction produces a notice. The guest cart is marked
    `merged`, so repeated logins/refreshes cannot merge it twice.
    """
    notices: list[dict[str, Any]] = []
    if not guest_cart_id:
        return notices
    with transaction.atomic():
        guest = Cart.objects.select_for_update().filter(pk=guest_cart_id, user__isnull=True, status=Cart.Status.ACTIVE).first()
        request.session.pop("cart_id", None)
        if guest is None:
            return notices
        user_cart = Cart.objects.select_for_update().filter(user=user, status=Cart.Status.ACTIVE).first()
        if user_cart is None:
            # Adopt the guest cart directly.
            guest.user = user
            guest.save(update_fields=["user", "updated_at"])
            return notices
        existing = {i.variant_id: i for i in CartItem.objects.select_for_update().filter(cart=user_cart)}
        for item in guest.items.select_related("variant__stock", "variant__product"):
            variant = item.variant
            available = _available(variant)
            active = variant.is_active and variant.product.status == Product.Status.PUBLISHED
            if not active:
                notices.append({"code": "dropped", "message": f"«{variant.product.name}» دیگر در دسترس نیست و از سبد حذف شد."})
                continue
            if variant.pk in existing:
                target = existing[variant.pk]
                desired = target.quantity + item.quantity
                capped = min(desired, MAX_QTY, max(available, target.quantity))
                if capped < desired:
                    notices.append(
                        {
                            "code": "reduced",
                            "message": f"تعداد «{variant.product.name}» (سایز {variant.size}) به دلیل موجودی/سقف خرید به {capped} محدود شد.",
                        }
                    )
                if capped != target.quantity:
                    target.quantity = capped
                    target.save(update_fields=["quantity", "updated_at"])
            else:
                if len(existing) >= settings.CART_MAX_LINES:
                    notices.append({"code": "dropped", "message": "سبد خرید پر است؛ برخی اقلام منتقل نشدند."})
                    break
                qty = min(item.quantity, MAX_QTY)
                if available and qty > available:
                    qty = available
                    notices.append(
                        {"code": "reduced", "message": f"تعداد «{variant.product.name}» به دلیل موجودی به {qty} محدود شد."}
                    )
                if qty <= 0:
                    qty = min(item.quantity, MAX_QTY)  # keep as unavailable line; checkout will flag it
                existing[variant.pk] = CartItem.objects.create(cart=user_cart, variant=variant, quantity=qty)
        guest.status = Cart.Status.MERGED
        guest.merged_into = user_cart
        guest.save(update_fields=["status", "merged_into", "updated_at"])
        _bump(user_cart)
    return notices


def remove_purchased(cart_id: Any, purchased: dict[int, int]) -> None:
    """After verified payment, subtract only the purchased quantities from the source cart,
    leaving anything the shopper added later (e.g. in another tab) untouched."""
    if not cart_id:
        return
    with transaction.atomic():
        cart = Cart.objects.select_for_update().filter(pk=cart_id).first()
        if cart is None:
            return
        for item in CartItem.objects.select_for_update().filter(cart=cart, variant_id__in=list(purchased)):
            remaining = item.quantity - purchased[item.variant_id]
            if remaining <= 0:
                item.delete()
            else:
                item.quantity = remaining
                item.save(update_fields=["quantity", "updated_at"])
        _bump(cart)


def cart_payload(cart: Cart | None) -> dict[str, Any]:
    if cart is None:
        return {
            "version": 0,
            "items": [],
            "item_count": 0,
            "subtotal_toman": 0,
            "currency": settings.CURRENCY,
            "has_issues": False,
        }
    items = (
        cart.items.select_related("variant__product", "variant__color", "variant__stock")
        .prefetch_related("variant__product__media")
        .order_by("added_at", "id")
    )
    out = []
    subtotal = 0
    count = 0
    has_issues = False
    for item in items:
        v = item.variant
        product = v.product
        available = _available(v)
        issue = None
        if not v.is_active or product.status != Product.Status.PUBLISHED:
            issue = "unavailable"
        elif available <= 0:
            issue = "out_of_stock"
        elif available < item.quantity:
            issue = "insufficient_stock"
        media = list(product.media.all())
        image = next((m for m in media if m.color_id == v.color_id), media[0] if media else None)
        line_total = v.price_toman * item.quantity
        if issue is None:
            subtotal += line_total
            count += item.quantity
        else:
            has_issues = True
        out.append(
            {
                "id": item.pk,
                "variant_id": v.pk,
                "product_slug": product.slug,
                "product_name": product.name,
                "color_code": v.color.code,
                "color_name": v.color.name,
                "color_hex": v.color.hex,
                "size": v.size,
                "sku": v.sku,
                "unit_price_toman": v.price_toman,
                "quantity": item.quantity,
                "line_total_toman": line_total,
                "image": image.thumb.url if image else None,
                "image_alt": image.alt_text if image else product.name,
                "max_quantity": min(max(available, 0), MAX_QTY),
                "issue": issue,
            }
        )
    return {
        "version": cart.version,
        "items": out,
        "item_count": count,
        "subtotal_toman": subtotal,
        "currency": settings.CURRENCY,
        "has_issues": has_issues,
    }
