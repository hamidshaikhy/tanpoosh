"use client";

import NextImage from "next/image";

import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { bag } from "@/content/fa";
import type { CartLine } from "@/lib/api/types";
import { faDigits, sizeLabel, toman } from "@/lib/format";
import { useCartLine } from "@/lib/queries";

export function CartLineRow({ line, version, compact = false }: { line: CartLine; version: number; compact?: boolean }) {
  const { update, remove } = useCartLine();
  const busy = update.isPending || remove.isPending;
  const issueText =
    line.issue === "unavailable" ? bag.unavailable : line.issue === "out_of_stock" ? bag.outOfStock : line.issue === "insufficient_stock" ? bag.insufficient(faDigits(line.max_quantity)) : null;
  const maxQty = Math.max(1, line.issue === "insufficient_stock" ? line.quantity : line.max_quantity);
  return (
    <div className={`flex gap-4 ${busy ? "opacity-60" : ""}`} data-testid="cart-line">
      <Link href={`/products/${line.product_slug}`} className={`shrink-0 bg-surface ${compact ? "w-20" : "w-24 sm:w-28"}`}>
        {line.image ? <NextImage width={1600} height={2000} src={line.image} alt={line.image_alt} className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5]" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/products/${line.product_slug}`} className="font-medium hover:underline">
            {line.product_name}
          </Link>
          <button
            type="button"
            onClick={() => remove.mutate(line.id)}
            disabled={busy}
            className="-m-1.5 p-1.5 text-muted hover:text-danger"
            aria-label={bag.removeItem(line.product_name)}
          >
            <Icon name="trash" className="size-4.5" />
          </button>
        </div>
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="inline-block size-3 rounded-full border border-ink/15" style={{ backgroundColor: line.color_hex }} aria-hidden="true" />
          {line.color_name}
          <span aria-hidden="true">·</span>
          سایز <bdi className="ltr">{sizeLabel(line.size)}</bdi>
        </p>
        {issueText ? <p className="text-xs text-danger">{issueText}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="flex items-center border border-line" role="group" aria-label={bag.qtyLabel(line.product_name)}>
            <button
              type="button"
              className="flex size-9 items-center justify-center hover:bg-surface-alt disabled:opacity-40"
              onClick={() => update.mutate({ id: line.id, quantity: line.quantity - 1, version })}
              disabled={busy || line.quantity <= 1}
              aria-label={bag.decrease}
            >
              <Icon name="minus" className="size-4" />
            </button>
            <span className="num min-w-8 text-center text-sm" aria-live="polite">
              {faDigits(line.quantity)}
            </span>
            <button
              type="button"
              className="flex size-9 items-center justify-center hover:bg-surface-alt disabled:opacity-40"
              onClick={() => update.mutate({ id: line.id, quantity: line.quantity + 1, version })}
              disabled={busy || line.quantity >= maxQty || Boolean(line.issue)}
              aria-label={bag.increase}
            >
              <Icon name="plus" className="size-4" />
            </button>
          </div>
          <p className="num text-sm">{toman(line.line_total_toman)}</p>
        </div>
      </div>
    </div>
  );
}
