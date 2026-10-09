"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { Button } from "@/components/ui/Button";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api/client";
import { faDigits, jalali, toman } from "@/lib/format";
import { useCan } from "@/manage/ManageShell";
import { useReauth } from "@/manage/reauth";
import { Card, PageHeader } from "@/manage/ui";

type Detail = {
  id: string;
  username: string;
  email: string;
  name: string;
  phone: string;
  is_active: boolean;
  email_verified: boolean;
  date_joined: string;
  live_spent_toman: number;
  support_messages: number;
  orders: { id: string; number: string; placed_at: string; total_toman: number; payment_status_label: string; fulfillment_status_label: string; is_test: boolean }[];
};

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const can = useCan();
  const withReauth = useReauth();
  const q = useQuery({ queryKey: ["manage", "customer", id], queryFn: () => api<Detail>(`/manage/customers/${id}`) });
  const toggle = useMutation({
    mutationFn: (active: boolean) => withReauth(() => api(`/manage/customers/${id}`, { method: "POST", body: { is_active: active } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manage", "customer", id] });
      toast.success("وضعیت حساب تغییر کرد.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorBlock message={errorMessage(q.error)} />;
  const c = q.data!;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={c.name || c.username}
        crumbs={[{ href: "/manage/customers", label: "مشتریان" }]}
        actions={
          can("customers.manage") ? (
            <Button size="sm" variant={c.is_active ? "danger" : "secondary"} onClick={() => toggle.mutate(!c.is_active)} loading={toggle.isPending}>
              {c.is_active ? "غیرفعال‌سازی حساب" : "فعال‌سازی حساب"}
            </Button>
          ) : null
        }
      />
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">نام کاربری</dt><dd className="ltr text-start">{c.username}</dd></div>
          <div><dt className="text-muted">ایمیل</dt><dd className="ltr text-start">{c.email} {c.email_verified ? <Badge tone="success">تأییدشده</Badge> : null}</dd></div>
          <div><dt className="text-muted">موبایل</dt><dd className="ltr text-start">{c.phone || "—"}</dd></div>
          <div><dt className="text-muted">عضویت</dt><dd>{jalali(c.date_joined)}</dd></div>
          <div><dt className="text-muted">خرید واقعی (Live)</dt><dd className="num">{toman(c.live_spent_toman)}</dd></div>
          <div><dt className="text-muted">پیام‌های پشتیبانی</dt><dd className="num">{faDigits(c.support_messages)}</dd></div>
        </dl>
      </Card>
      <Card title="سفارش‌ها">
        <ul className="divide-y divide-line-soft text-sm">
          {c.orders.map((o) => (
            <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
              <Link href={`/manage/orders/${o.id}`} className="ltr hover:underline">{o.number}</Link>
              <span className="text-xs text-muted">{jalali(o.placed_at)}</span>
              <span className="num">{toman(o.total_toman)}</span>
              <span>{o.payment_status_label} · {o.fulfillment_status_label} {o.is_test ? <Badge tone="warning">آزمایشی</Badge> : null}</span>
            </li>
          ))}
          {!c.orders.length ? <li className="py-4 text-muted">سفارشی ندارد.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
