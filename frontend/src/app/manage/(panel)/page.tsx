"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { api, errorMessage } from "@/lib/api/client";
import { faDigits, jalali, toman } from "@/lib/format";
import { RevenueChart } from "@/manage/RevenueChart";
import { Card, MiniSelect, PageHeader } from "@/manage/ui";

type Dashboard = {
  period: string;
  mode: string;
  revenue?: {
    gross_toman: number;
    refunds_toman: number;
    net_toman: number;
    orders: number;
    average_order_toman: number;
    series: { date: string; gross: number; orders: number }[];
    top_products: { product_name: string; quantity: number; revenue: number }[];
  };
  operations: Record<string, number>;
  recent_orders?: { id: string; number: string; placed_at: string; contact_name: string; total_toman: number; payment_status: string; payment_status_label: string; fulfillment_status_label: string; is_test: boolean }[];
};

const OPS: [string, string, string][] = [
  ["to_fulfill", "آمادهٔ پردازش و ارسال", "/manage/orders?fulfillment_status=processing"],
  ["needs_review", "پرداخت نیازمند بررسی", "/manage/orders?payment_status=needs_review"],
  ["unresolved_payments", "پرداخت‌های نامشخص (+۳۰ دقیقه)", "/manage/payments?status=unknown"],
  ["refunds_pending", "بازپرداخت در جریان", "/manage/refunds"],
  ["returns_open", "مرجوعی‌های باز", "/manage/returns"],
  ["low_stock", "تنوع‌های کم‌موجودی", "/manage/inventory?low=1"],
  ["support_open", "پیام‌های پشتیبانی باز", "/manage/support"],
  ["reviews_pending", "نظرات در انتظار بررسی", "/manage/reviews"],
];

export default function DashboardPage() {
  const [period, setPeriod] = useState("30d");
  const [mode, setMode] = useState("live");
  const q = useQuery({
    queryKey: ["manage", "dashboard", period, mode],
    queryFn: () => api<Dashboard>("/manage/dashboard", { query: { period, mode } }),
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="پیشخوان" subtitle="آمار بر اساس روز تقویم تهران و پرداخت‌های تأییدشده" />
      <div className="flex flex-wrap items-end gap-3">
        <MiniSelect label="بازه" value={period} onChange={setPeriod} options={[["today", "امروز"], ["7d", "۷ روز اخیر"], ["30d", "۳۰ روز اخیر"], ["90d", "۹۰ روز اخیر"]]} />
        <MiniSelect label="حالت داده" value={mode} onChange={setMode} options={[["live", "واقعی (Live)"], ["test", "آزمایشی (Sandbox/Mock)"], ["all", "همه"]]} />
        {mode !== "live" ? <Badge tone="warning">شامل پرداخت‌های آزمایشی — درآمد واقعی نیست</Badge> : null}
      </div>
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <ErrorBlock message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : null}
      {d ? (
        <div className={`flex flex-col gap-6 transition-opacity ${q.isFetching ? "opacity-60" : ""}`}>
          {d.revenue ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["فروش ناخالص", toman(d.revenue.gross_toman)],
                  ["بازپرداخت‌ها", toman(d.revenue.refunds_toman)],
                  ["فروش خالص", toman(d.revenue.net_toman)],
                  ["سفارش پرداخت‌شده", faDigits(d.revenue.orders)],
                  ["میانگین سفارش", toman(d.revenue.average_order_toman)],
                ].map(([label, value]) => (
                  <div key={label} className="border border-line bg-elevated p-4">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="num mt-2 text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <Card title="فروش ناخالص روزانه">
                <RevenueChart series={d.revenue.series} />
              </Card>
              {d.revenue.top_products.length ? (
                <Card title="پرفروش‌ترین‌ها در این بازه">
                  <ul className="divide-y divide-line-soft text-sm">
                    {d.revenue.top_products.map((p) => (
                      <li key={p.product_name} className="flex justify-between py-2">
                        <span>{p.product_name}</span>
                        <span className="num text-ink-soft">
                          {faDigits(p.quantity)} عدد · {toman(p.revenue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          ) : (
            <Notice>آمار مالی فقط برای نقش‌های دارای مجوز گزارش‌ها نمایش داده می‌شود.</Notice>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {OPS.map(([key, label, href]) => (
              <Link key={key} href={href} className="flex items-center justify-between border border-line bg-elevated p-4 hover:border-ink">
                <span className="text-sm text-ink-soft">{label}</span>
                <span className={`num text-xl font-semibold ${d.operations[key] && ["needs_review", "unresolved_payments"].includes(key) ? "text-danger" : ""}`}>{faDigits(d.operations[key] ?? 0)}</span>
              </Link>
            ))}
          </div>
          {d.recent_orders ? (
            <Card title="آخرین سفارش‌ها" actions={<Link href="/manage/orders" className="text-sm underline">همهٔ سفارش‌ها</Link>}>
              <ul className="divide-y divide-line-soft text-sm">
                {d.recent_orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/manage/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 hover:bg-surface-alt/40">
                      <span className="ltr font-medium">{o.number}</span>
                      <span>{o.contact_name}</span>
                      <span className="text-muted">{jalali(o.placed_at, { time: true })}</span>
                      <span className="num">{toman(o.total_toman)}</span>
                      <span className="flex gap-1.5">
                        <Badge>{o.payment_status_label}</Badge>
                        {o.is_test ? <Badge tone="warning">آزمایشی</Badge> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
