"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";

import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { api, errorMessage } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { faDigits, jalali, toman } from "@/lib/format";
import { FilterBar, MiniSelect, PageHeader, Pager, SearchInput, Table } from "@/manage/ui";

type Row = {
  id: string;
  number: string;
  placed_at: string;
  contact_name: string;
  city: string;
  total_toman: number;
  payment_status: string;
  payment_status_label: string;
  fulfillment_status: string;
  fulfillment_status_label: string;
  is_test: boolean;
  is_guest: boolean;
  item_count: number;
};

const PAYMENT_OPTIONS: [string, string][] = [
  ["", "همه"],
  ["unpaid", "پرداخت‌نشده"],
  ["pending", "در انتظار تأیید"],
  ["verified", "پرداخت‌شده"],
  ["failed", "ناموفق"],
  ["cancelled", "لغوشده"],
  ["needs_review", "نیازمند بررسی"],
  ["refund_pending", "در انتظار بازپرداخت"],
  ["partially_refunded", "بازپرداخت جزئی"],
  ["refunded", "بازپرداخت کامل"],
];
const FULFILL_OPTIONS: [string, string][] = [
  ["", "همه"],
  ["awaiting_payment", "در انتظار پرداخت"],
  ["processing", "در حال آماده‌سازی"],
  ["packed", "بسته‌بندی‌شده"],
  ["shipped", "ارسال‌شده"],
  ["delivered", "تحویل‌شده"],
  ["cancelled", "لغوشده"],
  ["returned", "مرجوع‌شده"],
];

function OrdersInner() {
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [payment, setPayment] = useState(params.get("payment_status") ?? "");
  const [fulfillment, setFulfillment] = useState(params.get("fulfillment_status") ?? "");
  const [mode, setMode] = useState("all");
  const [page, setPage] = useState(1);
  const dq = useDeferredValue(q);
  const list = useQuery({
    queryKey: ["manage", "orders", dq, payment, fulfillment, mode, page],
    queryFn: () => api<Paginated<Row>>("/manage/orders", { query: { q: dq, payment_status: payment, fulfillment_status: fulfillment, mode, page } }),
    placeholderData: (p) => p,
  });
  const reset = () => setPage(1);
  return (
    <div>
      <PageHeader title="سفارش‌ها" />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="شماره، نام، ایمیل یا موبایل" />
        <MiniSelect label="پرداخت" value={payment} onChange={(v) => { setPayment(v); reset(); }} options={PAYMENT_OPTIONS} />
        <MiniSelect label="ارسال" value={fulfillment} onChange={(v) => { setFulfillment(v); reset(); }} options={FULFILL_OPTIONS} />
        <MiniSelect label="حالت" value={mode} onChange={(v) => { setMode(v); reset(); }} options={[["all", "همه"], ["live", "واقعی"], ["test", "آزمایشی"]]} />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["شماره", "مشتری", "شهر", "زمان ثبت", "اقلام", "مبلغ", "پرداخت", "ارسال"]} empty={!list.data.results.length}>
            {list.data.results.map((o) => (
              <tr key={o.id} className="hover:bg-surface-alt/40">
                <td className="px-4 py-2">
                  <Link href={`/manage/orders/${o.id}`} className="ltr font-medium underline-offset-4 hover:underline">
                    {o.number}
                  </Link>
                  {o.is_test ? <Badge tone="warning">آزمایشی</Badge> : null}
                </td>
                <td className="px-4 py-2">
                  {o.contact_name} {o.is_guest ? <span className="text-xs text-muted">(مهمان)</span> : null}
                </td>
                <td className="px-4 py-2">{o.city}</td>
                <td className="px-4 py-2 text-xs">{jalali(o.placed_at, { time: true })}</td>
                <td className="num px-4 py-2">{faDigits(o.item_count)}</td>
                <td className="num px-4 py-2">{toman(o.total_toman)}</td>
                <td className="px-4 py-2">
                  <Badge tone={o.payment_status === "verified" ? "success" : o.payment_status === "needs_review" ? "danger" : "neutral"}>{o.payment_status_label}</Badge>
                </td>
                <td className="px-4 py-2">
                  <Badge>{o.fulfillment_status_label}</Badge>
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={list.data.total_pages} onChange={setPage} />
        </>
      ) : null}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersInner />
    </Suspense>
  );
}
