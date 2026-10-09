"use client";

import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { bag } from "@/content/fa";
import { errorMessage } from "@/lib/api/client";
import { toman } from "@/lib/format";
import { useCart } from "@/lib/queries";

import { CartLineRow } from "./CartLineRow";

export function BagView() {
  const { data: cart, isLoading, isError, error, refetch } = useCart();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <h1 className="mb-8 border-b border-line-soft pb-6 text-3xl font-bold">{bag.title}</h1>
      {isLoading ? <LoadingBlock /> : null}
      {isError ? <ErrorBlock message={errorMessage(error)} onRetry={() => refetch()} /> : null}
      {cart && cart.items.length === 0 ? (
        <EmptyBlock
          title={bag.empty}
          icon="bag"
          action={
            <ButtonLink href="/shop" variant="secondary">
              {bag.emptyCta}
            </ButtonLink>
          }
        />
      ) : null}
      {cart && cart.items.length > 0 ? (
        <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
          <ul className="divide-y divide-line-soft border-y border-line-soft">
            {cart.items.map((line) => (
              <li key={line.id} className="py-5">
                <CartLineRow line={line} version={cart.version} />
              </li>
            ))}
          </ul>
          <aside className="flex flex-col gap-4 self-start border border-line bg-elevated p-6 lg:sticky lg:top-6" aria-label="خلاصهٔ سبد">
            <div className="flex justify-between">
              <span>{bag.subtotal}</span>
              <span className="num">{toman(cart.subtotal_toman)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted">
              <span>{bag.shipping}</span>
              <span>{bag.shippingNext}</span>
            </div>
            <p className="text-xs text-muted">{bag.priceNote}</p>
            {cart.has_issues ? <Notice tone="warning">{bag.fixIssues}</Notice> : null}
            <ButtonLink href="/checkout" size="lg" className={`w-full justify-between ${cart.has_issues ? "pointer-events-none opacity-50" : ""}`} icon={<Icon name="arrow" />}>
              {bag.checkout}
            </ButtonLink>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
