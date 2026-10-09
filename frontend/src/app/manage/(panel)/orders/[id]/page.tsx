"use client";

import NextImage from "next/image";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextareaField, TextField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import type { OrderDetail } from "@/lib/api/types";
import { faDigits, jalali, sizeLabel, toAsciiDigits, toman } from "@/lib/format";
import { useCan } from "@/manage/ManageShell";
import { useReauth } from "@/manage/reauth";
import { Card, PageHeader } from "@/manage/ui";

const ACTIONS: Record<string, { action: string; label: string }[]> = {
  processing: [{ action: "pack", label: "ثبت بسته‌بندی" }],
  packed: [
    { action: "ship", label: "ثبت ارسال" },
    { action: "unpack", label: "بازگشت به آماده‌سازی" },
  ],
  shipped: [{ action: "deliver", label: "ثبت تحویل" }],
};

export default function ManageOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const can = useCan();
  const withReauth = useReauth();
  const order = useQuery({ queryKey: ["manage", "order", id], queryFn: () => api<OrderDetail>(`/manage/orders/${id}`) });
  const set = (o: OrderDetail) => {
    qc.setQueryData(["manage", "order", id], o);
    qc.invalidateQueries({ queryKey: ["manage", "orders"] });
  };
  const [shipOpen, setShipOpen] = useState(false);
  const [ship, setShip] = useState({ carrier: "", tracking_code: "", note: "" });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refund, setRefund] = useState({ amount: "", reason: "" });
  const [note, setNote] = useState("");
  const [review, setReview] = useState<{ action: string; note: string } | null>(null);

  const fulfill = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<OrderDetail>(`/manage/orders/${id}/fulfillment`, { method: "POST", body: { ...body, version: order.data?.version } }),
    onSuccess: (o) => {
      set(o);
      setShipOpen(false);
      toast.success("وضعیت سفارش به‌روز شد.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api<OrderDetail>(`/manage/orders/${id}/cancel`, { method: "POST", body: { reason: cancelReason } }),
    onSuccess: (o) => {
      set(o);
      setCancelOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addNote = useMutation({
    mutationFn: () => api<OrderDetail>(`/manage/orders/${id}/note`, { method: "POST", body: { message: note } }),
    onSuccess: (o) => {
      set(o);
      setNote("");
    },
  });
  const requestRefund = useMutation({
    mutationFn: () => withReauth(() => api<OrderDetail>(`/manage/orders/${id}/refunds`, { method: "POST", body: { amount_toman: Number(toAsciiDigits(refund.amount).replace(/[^\d]/g, "")), reason: refund.reason } })),
    onSuccess: (o) => {
      set(o);
      setRefundOpen(false);
      toast.success("درخواست بازپرداخت ثبت شد؛ از صفحهٔ بازپرداخت‌ها پیگیری کنید.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resolve = useMutation({
    mutationFn: (r: { action: string; note: string }) => withReauth(() => api<OrderDetail>(`/manage/orders/${id}/resolve-review`, { method: "POST", body: r })),
    onSuccess: (o) => {
      set(o);
      setReview(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (order.isLoading) return <LoadingBlock />;
  if (order.isError) return <ErrorBlock message={errorMessage(order.error)} />;
  const o = order.data!;
  const actions = o.payment_status === "verified" ? ACTIONS[o.fulfillment_status] ?? [] : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`سفارش ${o.number}`}
        subtitle={jalali(o.placed_at, { time: true })}
        crumbs={[{ href: "/manage/orders", label: "سفارش‌ها" }]}
        actions={
          <>
            <Badge tone={o.payment_status === "verified" ? "success" : o.payment_status === "needs_review" ? "danger" : "neutral"}>{o.payment_status_label}</Badge>
            <Badge>{o.fulfillment_status_label}</Badge>
            {o.is_test ? <Badge tone="warning">آزمایشی ({o.payment_mode || "sandbox"})</Badge> : null}
          </>
        }
      />
      {o.review_reason ? (
        <Notice tone="danger">
          <p>{o.review_reason}</p>
          {can("payments.reconcile") && o.payment_status === "needs_review" ? (
            <div className="mt-3 flex gap-3">
              <Button size="sm" onClick={() => setReview({ action: "accept", note: "" })}>
                تأیید و آزادسازی برای ارسال
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setReview({ action: "refund", note: "" })}>
                تصمیم به بازپرداخت
              </Button>
            </div>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {can("orders.fulfill")
          ? actions.map((a) => (
              <Button key={a.action} onClick={() => (a.action === "ship" ? setShipOpen(true) : fulfill.mutate({ action: a.action }))} loading={fulfill.isPending} data-testid={`fulfill-${a.action}`}>
                {a.label}
              </Button>
            ))
          : null}
        {can("orders.cancel") && ["awaiting_payment", "processing", "packed"].includes(o.fulfillment_status) && !["cancelled", "refunded"].includes(o.payment_status) ? (
          <Button variant="secondary" onClick={() => setCancelOpen(true)}>
            لغو سفارش
          </Button>
        ) : null}
        {can("refunds.manage") && ["verified", "partially_refunded", "needs_review", "refund_pending"].includes(o.payment_status) ? (
          <Button variant="secondary" onClick={() => setRefundOpen(true)}>
            درخواست بازپرداخت
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card title="اقلام (تصویر ثابت قیمت/نام هنگام خرید)">
            <ul className="divide-y divide-line-soft text-sm">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2">
                  {i.image ? <NextImage width={1600} height={2000} src={i.image} alt="" className="aspect-[4/5] w-10 bg-surface object-cover" /> : null}
                  <span className="flex-1">
                    {i.product_name} — {i.color_name} — <bdi className="ltr">{sizeLabel(i.size)}</bdi>
                    <span className="ltr block text-start text-xs text-muted">{i.sku}</span>
                  </span>
                  <span className="num">
                    {faDigits(i.quantity)} × {toman(i.unit_price_toman)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-1 border-t border-line-soft pt-3 text-sm">
              <div className="flex justify-between"><dt>جمع کالا</dt><dd className="num">{toman(o.subtotal_toman)}</dd></div>
              <div className="flex justify-between"><dt>تخفیف {o.coupon_code ? <bdi className="ltr">({o.coupon_code})</bdi> : null}</dt><dd className="num">{toman(o.discount_toman)}</dd></div>
              <div className="flex justify-between"><dt>ارسال ({o.shipping_method.name})</dt><dd className="num">{toman(o.shipping_toman)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>مبلغ کل</dt><dd className="num">{toman(o.total_toman)}</dd></div>
              <div className="flex justify-between text-muted"><dt>بازپرداخت‌شده</dt><dd className="num">{toman(o.refunded_toman)}</dd></div>
            </dl>
          </Card>
          <Card title="تلاش‌های پرداخت (فقط‌خواندنی)">
            {!o.payment_attempts.length ? <p className="text-sm text-muted">هنوز تلاشی ثبت نشده است.</p> : null}
            <ul className="flex flex-col gap-3 text-xs">
              {o.payment_attempts.map((a) => (
                <li key={a.id} className="grid gap-1 border border-line-soft p-3 sm:grid-cols-2">
                  <span>
                    وضعیت: <strong>{a.status_label}</strong> · {a.provider}/{a.mode}
                  </span>
                  <span className="num">
                    مبلغ مورد انتظار: {toman(a.amount_toman ?? 0)} ← ارسالی: {faDigits(a.provider_amount ?? 0)} <span className="ltr">{a.provider_currency}</span>
                  </span>
                  <span className="ltr text-start">authority: {a.authority || "—"}</span>
                  <span className="ltr text-start">ref_id: {a.ref_id || "—"} · code: {a.provider_code ?? "—"}</span>
                  <span>{jalali(a.created_at, { time: true })}</span>
                  {a.failure_reason ? <span className="text-danger">{a.failure_reason}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="تاریخچه">
            <ol className="flex flex-col gap-2 text-sm">
              {o.events.map((e, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-line-soft pb-2">
                  <span>{e.message || `${e.from_status} → ${e.to_status}`}</span>
                  <span className="text-xs text-muted">
                    {e.actor} · {jalali(e.created_at, { time: true })}
                  </span>
                </li>
              ))}
            </ol>
            {can("orders.fulfill") ? (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addNote.mutate();
                }}
              >
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت داخلی (برای مشتری نمایش داده نمی‌شود)" className="h-10 flex-1 border border-line bg-elevated px-3 text-sm" maxLength={300} />
                <Button type="submit" size="sm" variant="secondary" disabled={!note} loading={addNote.isPending}>
                  ثبت
                </Button>
              </form>
            ) : null}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="مشتری و تحویل">
            <div className="flex flex-col gap-1 text-sm">
              <p>{o.contact.name} {o.is_guest ? <Badge>مهمان</Badge> : null}</p>
              <p className="ltr text-start">{o.contact.phone}</p>
              <p className="ltr text-start">{o.contact.email}</p>
              <p className="mt-3 text-ink-soft">
                {o.shipping_address.recipient_name}، {o.shipping_address.province}، {o.shipping_address.city}، {o.shipping_address.line}
                {o.shipping_address.plaque ? `، پلاک ${o.shipping_address.plaque}` : ""}
                {o.shipping_address.unit ? `، واحد ${o.shipping_address.unit}` : ""}
              </p>
              <p className="ltr text-start text-muted">
                {o.shipping_address.postal_code} · {o.shipping_address.phone}
              </p>
              {o.customer_note ? <p className="mt-2 border-s-2 border-accent ps-3">{o.customer_note}</p> : null}
            </div>
          </Card>
          {o.shipments.length ? (
            <Card title="مرسوله‌ها">
              {o.shipments.map((s, i) => (
                <p key={i} className="text-sm">
                  {s.carrier} · <bdi className="ltr">{s.tracking_code || "—"}</bdi> · {jalali(s.shipped_at)}
                </p>
              ))}
            </Card>
          ) : null}
          {o.refunds?.length ? (
            <Card title="بازپرداخت‌ها">
              {o.refunds.map((r) => (
                <p key={r.id} className="flex justify-between text-sm">
                  <span>{r.status_label}</span>
                  <span className="num">{toman(r.amount_toman)}</span>
                </p>
              ))}
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={shipOpen} onClose={() => setShipOpen(false)} title="ثبت ارسال" size="sm">
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            fulfill.mutate({ action: "ship", ...ship });
          }}
        >
          <TextField label="شرکت حمل" required value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} error={fieldErrors(fulfill.error).carrier} maxLength={60} />
          <TextField label="کد رهگیری" ltr value={ship.tracking_code} onChange={(e) => setShip({ ...ship, tracking_code: e.target.value })} maxLength={60} />
          <TextField label="یادداشت" value={ship.note} onChange={(e) => setShip({ ...ship, note: e.target.value })} maxLength={300} />
          <Button type="submit" loading={fulfill.isPending} disabled={!ship.carrier}>
            ثبت ارسال
          </Button>
        </form>
      </Dialog>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="لغو سفارش" size="sm">
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            cancel.mutate();
          }}
        >
          <Notice tone="warning">{o.payment_status === "verified" ? "این سفارش پرداخت شده است: کالاها به انبار برمی‌گردند و یک درخواست بازپرداخت ایجاد می‌شود (بازپرداخت خودکار انجام نمی‌شود)." : "رزرو کالاها آزاد می‌شود."}</Notice>
          <TextareaField label="دلیل لغو" required value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={300} />
          <Button type="submit" variant="danger" loading={cancel.isPending} disabled={!cancelReason}>
            لغو سفارش
          </Button>
        </form>
      </Dialog>
      <Dialog open={refundOpen} onClose={() => setRefundOpen(false)} title="درخواست بازپرداخت" size="sm">
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            requestRefund.mutate();
          }}
        >
          <p className="text-sm text-muted">سقف: مبلغ پرداخت‌شده منهای بازپرداخت‌های ثبت‌شده. این درخواست پس از تأیید و انجام دستی با ثبت شمارهٔ مرجع تکمیل می‌شود.</p>
          <TextField label="مبلغ (تومان)" inputMode="numeric" required value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} error={fieldErrors(requestRefund.error).amount_toman} />
          <TextareaField label="دلیل" required value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} maxLength={300} />
          {requestRefund.isError ? <Notice tone="danger">{errorMessage(requestRefund.error)}</Notice> : null}
          <Button type="submit" loading={requestRefund.isPending} disabled={!refund.amount || !refund.reason}>
            ثبت درخواست
          </Button>
        </form>
      </Dialog>
      <Dialog open={Boolean(review)} onClose={() => setReview(null)} title="حل وضعیت نیازمند بررسی" size="sm">
        {review ? (
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              resolve.mutate(review);
            }}
          >
            <Notice>{review.action === "accept" ? "در صورت کسر نشدن موجودی، موجودی فعلی برای این سفارش برداشته می‌شود؛ اگر کافی نباشد عملیات رد می‌شود." : "یک درخواست بازپرداخت برای مبلغ باقی‌مانده ایجاد می‌شود."}</Notice>
            <TextareaField label="توضیح (الزامی)" required value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} maxLength={300} />
            <Button type="submit" loading={resolve.isPending} disabled={!review.note}>
              ثبت تصمیم
            </Button>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
