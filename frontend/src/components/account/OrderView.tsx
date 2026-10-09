"use client";

import NextImage from "next/image";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField, TextareaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { account as copy, bag, checkout, returnReasons } from "@/content/fa";
import { api, ApiError, errorMessage, fieldErrors, newIdempotencyKey } from "@/lib/api/client";
import type { OrderDetail } from "@/lib/api/types";
import { faDigits, jalali, sizeLabel, toman } from "@/lib/format";
import { keys } from "@/lib/queries";

export function statusTone(payment: string, fulfillment: string): "success" | "warning" | "danger" | "neutral" | "dark" {
  if (payment === "needs_review") return "warning";
  if (["failed", "cancelled"].includes(payment) || fulfillment === "cancelled") return "danger";
  if (fulfillment === "delivered") return "success";
  if (payment === "verified") return "dark";
  return "neutral";
}

export function OrderView({ id }: { id: string }) {
  const qc = useQueryClient();
  const order = useQuery({ queryKey: keys.order(id), queryFn: () => api<OrderDetail>(`/orders/${id}`) });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const pay = useMutation({
    mutationFn: () => api<{ redirect_url: string }>(`/orders/${id}/pay`, { method: "POST", idempotencyKey: newIdempotencyKey() }),
    onSuccess: (r) => window.location.assign(r.redirect_url),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api<OrderDetail>(`/orders/${id}/cancel`, { method: "POST" }),
    onSuccess: (o) => {
      qc.setQueryData(keys.order(id), o);
      qc.invalidateQueries({ queryKey: keys.orders });
      setConfirmCancel(false);
      toast.success("سفارش لغو شد.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (order.isLoading) return <LoadingBlock className="min-h-[50vh]" />;
  if (order.isError) {
    const notFound = order.error instanceof ApiError && order.error.status === 404;
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorBlock message={notFound ? "سفارش پیدا نشد یا اجازهٔ مشاهدهٔ آن را ندارید." : errorMessage(order.error)} onRetry={notFound ? undefined : () => order.refetch()} />
        {notFound ? (
          <p className="mt-4 text-center text-sm">
            <Link href="/orders/track" className="underline">
              پیگیری سفارش مهمان
            </Link>
          </p>
        ) : null}
      </div>
    );
  }
  const o = order.data!;
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <div className="hidden print:mb-6 print:block">
        <BrandLogo className="h-6 w-auto" />
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line-soft pb-6">
        <div>
          <p className="text-sm text-muted">{copy.receipt}</p>
          <h1 className="mt-1 text-2xl font-bold">
            سفارش <bdi className="ltr">{o.number}</bdi>
          </h1>
          <p className="mt-1 text-sm text-muted">{jalali(o.placed_at, { time: true })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(o.payment_status, o.fulfillment_status)}>{o.payment_status_label}</Badge>
          <Badge>{o.fulfillment_status_label}</Badge>
          {o.is_test ? <Badge tone="warning">{o.payment_mode === "mock" ? checkout.mockBadge : "پرداخت آزمایشی (Sandbox)"}</Badge> : null}
        </div>
      </div>

      {o.can_pay ? (
        <Notice tone="warning" className="mb-6">
          این سفارش هنوز پرداخت نشده است.
          {o.reservation_expires_at ? ` کالاها تا ${jalali(o.reservation_expires_at, { time: true })} برای شما رزرو هستند.` : ""}
        </Notice>
      ) : null}

      <div className="no-print mb-8 flex flex-wrap gap-3">
        {o.can_pay ? (
          <Button onClick={() => pay.mutate()} loading={pay.isPending} icon={<Icon name="lock" />}>
            {copy.payNow}
          </Button>
        ) : null}
        {o.can_cancel ? (
          <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
            {copy.cancelOrder}
          </Button>
        ) : null}
        {o.can_return ? (
          <Button variant="secondary" onClick={() => setReturnOpen(true)}>
            {copy.requestReturn}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => window.print()} icon={<Icon name="file" />}>
          {copy.printReceipt}
        </Button>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-10">
          <section aria-labelledby="items-title">
            <h2 id="items-title" className="mb-4 font-semibold">
              {copy.items}
            </h2>
            <ul className="divide-y divide-line-soft border-y border-line-soft">
              {o.items.map((i) => (
                <li key={i.id} className="flex gap-4 py-4">
                  {i.image ? <NextImage width={1600} height={2000} src={i.image} alt="" className="aspect-[4/5] w-20 bg-surface object-cover" /> : <div className="aspect-[4/5] w-20 bg-surface" />}
                  <div className="flex flex-1 flex-col gap-1 text-sm">
                    <Link href={`/products/${i.product_slug}`} className="font-medium hover:underline">
                      {i.product_name}
                    </Link>
                    <span className="text-ink-soft">
                      {i.color_name} · سایز <bdi className="ltr">{sizeLabel(i.size)}</bdi> · {faDigits(i.quantity)} عدد
                    </span>
                    <span className="ltr text-start text-xs text-muted">{i.sku}</span>
                    {i.returned_quantity ? <span className="text-xs text-warning">مرجوع‌شده: {faDigits(i.returned_quantity)}</span> : null}
                  </div>
                  <span className="num text-sm">{toman(i.line_total_toman)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="timeline-title" className="no-print">
            <h2 id="timeline-title" className="mb-4 font-semibold">
              {copy.timeline}
            </h2>
            <ol className="relative flex flex-col gap-4 border-s border-line ps-6">
              {o.events.map((e, idx) => (
                <li key={idx} className="relative text-sm">
                  <span className="absolute -start-[29px] top-2 size-2.5 rounded-full bg-ink" aria-hidden="true" />
                  <p>{e.message}</p>
                  <p className="text-xs text-muted">{jalali(e.created_at, { time: true })}</p>
                </li>
              ))}
            </ol>
          </section>

          {o.returns.length ? (
            <section aria-labelledby="returns-title">
              <h2 id="returns-title" className="mb-4 font-semibold">
                {copy.returns}
              </h2>
              <ul className="flex flex-col gap-3">
                {o.returns.map((r) => (
                  <li key={r.id} className="border border-line p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{r.reason_label}</span>
                      <Badge>{r.status_label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">{jalali(r.created_at)}</p>
                    {r.staff_note ? <p className="mt-2 text-ink-soft">{r.staff_note}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6 self-start">
          <section className="border border-line bg-elevated p-5 text-sm">
            <h2 className="mb-3 font-semibold">{copy.paymentInfo}</h2>
            <dl className="flex flex-col gap-2">
              <Row label={bag.subtotal} value={toman(o.subtotal_toman)} />
              {o.discount_toman ? <Row label={`${bag.discount}${o.coupon_code ? ` (${o.coupon_code})` : ""}`} value={`− ${toman(o.discount_toman)}`} /> : null}
              <Row label={`${bag.shipping} (${o.shipping_method.name})`} value={o.shipping_toman ? toman(o.shipping_toman) : bag.free} />
              <div className="mt-1 flex justify-between border-t border-line-soft pt-3 text-base font-semibold">
                <dt>{bag.total}</dt>
                <dd className="num">{toman(o.total_toman)}</dd>
              </div>
              {o.refunded_toman ? <Row label="بازپرداخت‌شده" value={toman(o.refunded_toman)} /> : null}
              {o.payment_reference ? <Row label="کد پیگیری پرداخت" value={o.payment_reference} ltr /> : null}
              {o.paid_at ? <Row label="زمان پرداخت" value={jalali(o.paid_at, { time: true })} /> : null}
            </dl>
          </section>
          <section className="border border-line p-5 text-sm">
            <h2 className="mb-3 font-semibold">{copy.delivery}</h2>
            <p>{o.shipping_address.recipient_name}</p>
            <p className="text-ink-soft">
              {o.shipping_address.province}، {o.shipping_address.city}، {o.shipping_address.line}
              {o.shipping_address.plaque ? `، پلاک ${o.shipping_address.plaque}` : ""}
              {o.shipping_address.unit ? `، واحد ${o.shipping_address.unit}` : ""}
            </p>
            <p className="ltr mt-1 text-start text-muted">
              {faDigits(o.shipping_address.postal_code)} · {o.shipping_address.phone}
            </p>
            {o.shipments.map((s, i) => (
              <p key={i} className="mt-3 border-t border-line-soft pt-3">
                {s.carrier}
                {s.tracking_code ? (
                  <>
                    {" "}— {copy.tracking}: <bdi className="ltr">{s.tracking_code}</bdi>
                  </>
                ) : null}
              </p>
            ))}
          </section>
        </aside>
      </div>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title={copy.cancelOrder} size="sm">
        <div className="flex flex-col gap-5 p-5">
          <p className="text-sm leading-7">{copy.cancelConfirm}</p>
          <div className="flex gap-3">
            <Button variant="danger" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              {copy.cancelOrder}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              انصراف
            </Button>
          </div>
        </div>
      </Dialog>
      {o.can_return ? <ReturnDialog open={returnOpen} onClose={() => setReturnOpen(false)} order={o} /> : null}
    </div>
  );
}

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={ltr ? "ltr" : "num"}>{value}</dd>
    </div>
  );
}

function ReturnDialog({ open, onClose, order }: { open: boolean; onClose: () => void; order: OrderDetail }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState<Record<number, number>>({});
  const remaining = Object.fromEntries(order.returnable.map((r) => [r.order_item_id, r.remaining]));
  const submit = useMutation({
    mutationFn: () =>
      api<OrderDetail>(`/orders/${order.id}/returns`, {
        method: "POST",
        body: {
          reason,
          description,
          items: Object.entries(qty)
            .filter(([, q]) => q > 0)
            .map(([id, q]) => ({ order_item_id: Number(id), quantity: q })),
        },
      }),
    onSuccess: (o) => {
      qc.setQueryData(keys.order(order.id), o);
      toast.success("درخواست مرجوعی ثبت شد.");
      onClose();
    },
  });
  const errors = fieldErrors(submit.error);
  return (
    <Dialog open={open} onClose={onClose} title={copy.requestReturn} size="lg">
      <form
        className="flex flex-col gap-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        {order.return_deadline ? <p className="text-sm text-muted">{copy.returnWindow(jalali(order.return_deadline))}</p> : null}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">کالاها</legend>
          {order.items.map((i) => (
            <label key={i.id} className="flex items-center justify-between gap-4 border border-line p-3 text-sm">
              <span>
                {i.product_name} — {i.color_name} — <bdi className="ltr">{sizeLabel(i.size)}</bdi>
              </span>
              <select
                className="h-10 border border-line bg-elevated px-2"
                value={qty[i.id] ?? 0}
                onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })}
                disabled={!remaining[i.id]}
                aria-label={`${copy.returnQty} ${i.product_name}`}
              >
                {Array.from({ length: (remaining[i.id] ?? 0) + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {faDigits(n)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {errors.items ? <p className="text-xs text-danger">{errors.items}</p> : null}
        </fieldset>
        <SelectField label={copy.returnReason} required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason}>
          <option value="">انتخاب کنید…</option>
          {returnReasons.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        <TextareaField label={copy.returnDescription} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        {submit.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(submit.error)}</Notice> : null}
        <Button type="submit" loading={submit.isPending} disabled={!reason || !Object.values(qty).some((q) => q > 0)}>
          {copy.submitReturn}
        </Button>
      </form>
    </Dialog>
  );
}
