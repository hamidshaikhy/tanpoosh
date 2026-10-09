"use client";

import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { bag } from "@/content/fa";
import { errorMessage } from "@/lib/api/client";
import { faDigits, toman } from "@/lib/format";
import { useCart } from "@/lib/queries";
import { useUI } from "@/lib/ui-store";

import { CartLineRow } from "../cart/CartLineRow";

export function CartDrawer() {
  const open = useUI((s) => s.cartOpen);
  const close = useUI((s) => s.closeCart);
  const { data: cart, isLoading, isError, error, refetch } = useCart();
  return (
    <Dialog open={open} onClose={close} title={`${bag.miniTitle} (${faDigits(cart?.items.length ?? 0)})`} side="end">
      <div className="flex h-full flex-col">
        <div className="flex-1 px-5 py-4">
          {isLoading ? <LoadingBlock /> : null}
          {isError ? <ErrorBlock message={errorMessage(error)} onRetry={() => refetch()} /> : null}
          {cart && cart.items.length === 0 ? (
            <EmptyBlock
              title={bag.empty}
              icon="bag"
              action={
                <ButtonLink href="/shop" variant="secondary" size="sm">
                  {bag.emptyCta}
                </ButtonLink>
              }
            />
          ) : null}
          {cart && cart.items.length > 0 ? (
            <ul className="divide-y divide-line-soft">
              {cart.items.map((line) => (
                <li key={line.id} className="py-4">
                  <CartLineRow line={line} version={cart.version} compact />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {cart && cart.items.length > 0 ? (
          <div className="sticky bottom-0 border-t border-line bg-bg px-5 py-4">
            {cart.has_issues ? <Notice tone="warning" className="mb-3">{bag.fixIssues}</Notice> : null}
            <div className="flex items-center justify-between text-[15px]">
              <span>{bag.subtotal}</span>
              <span className="num font-medium">{toman(cart.subtotal_toman)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{bag.priceNote}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ButtonLink href="/bag" variant="secondary" className="w-full">
                {bag.title}
              </ButtonLink>
              <ButtonLink href="/checkout" className={`w-full ${cart.has_issues ? "pointer-events-none opacity-50" : ""}`}>
                {bag.checkout}
              </ButtonLink>
            </div>
            <Link href="/shop" onClick={close} className="mt-3 block text-center text-sm text-muted hover:text-ink">
              {bag.continueShopping}
            </Link>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
