"use client";

import NextImage from "next/image";

import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { Badge, EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { account as copy } from "@/content/fa";
import { errorMessage } from "@/lib/api/client";
import type { OrderSummary, Paginated } from "@/lib/api/types";
import { faDigits, jalali, toman } from "@/lib/format";

import { statusTone } from "./OrderView";

export function OrderList({ query, compact = false }: { query: UseQueryResult<Paginated<OrderSummary>>; compact?: boolean }) {
  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const rows = query.data!.results.slice(0, compact ? 3 : undefined);
  if (!rows.length) {
    return <EmptyBlock title={copy.noOrders} action={<ButtonLink href="/shop" variant="secondary" size="sm">مشاهدهٔ پوشاک</ButtonLink>} />;
  }
  return (
    <ul className="divide-y divide-line-soft border-y border-line-soft" data-testid="order-list">
      {rows.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="flex items-center gap-4 py-4 hover:bg-surface-alt/40">
            {o.thumbnail ? <NextImage width={1600} height={2000} src={o.thumbnail} alt="" className="aspect-[4/5] w-14 bg-surface object-cover" /> : <span className="aspect-[4/5] w-14 bg-surface" />}
            <div className="flex flex-1 flex-col gap-1 text-sm">
              <span className="ltr self-start font-medium">{o.number}</span>
              <span className="text-muted">
                {jalali(o.placed_at)} · {faDigits(o.item_count)} کالا
              </span>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="num text-sm">{toman(o.total_toman)}</span>
              <div className="flex gap-1.5">
                <Badge tone={statusTone(o.payment_status, o.fulfillment_status)}>{o.payment_status_label}</Badge>
                {o.is_test ? <Badge tone="warning">آزمایشی</Badge> : null}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
