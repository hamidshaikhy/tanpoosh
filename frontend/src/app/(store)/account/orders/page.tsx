"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageTitle } from "@/components/account/AccountShell";
import { OrderList } from "@/components/account/OrderList";
import { account as copy } from "@/content/fa";
import { api } from "@/lib/api/client";
import type { OrderSummary, Paginated } from "@/lib/api/types";
import { faDigits } from "@/lib/format";
import { keys } from "@/lib/queries";

export default function AccountOrders() {
  const [page, setPage] = useState(1);
  const orders = useQuery({ queryKey: [...keys.orders, page], queryFn: () => api<Paginated<OrderSummary>>("/orders", { query: { page } }) });
  const total = orders.data?.total_pages ?? 1;
  return (
    <div>
      <PageTitle>{copy.orders}</PageTitle>
      <OrderList query={orders} />
      {total > 1 ? (
        <div className="mt-6 flex items-center gap-4 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="underline disabled:opacity-40">
            قبلی
          </button>
          <span className="text-muted">
            صفحهٔ {faDigits(page)} از {faDigits(total)}
          </span>
          <button type="button" disabled={page >= total} onClick={() => setPage(page + 1)} className="underline disabled:opacity-40">
            بعدی
          </button>
        </div>
      ) : null}
    </div>
  );
}
