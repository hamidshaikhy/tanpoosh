"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, TextareaField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { bag, checkout as copy } from "@/content/fa";
import { api, ApiError, errorMessage, fieldErrors, newIdempotencyKey } from "@/lib/api/client";
import type { Address, OrderDetail, Quote } from "@/lib/api/types";
import { faDigits, shortToman, sizeLabel, toman } from "@/lib/format";
import { normalizeMobile, normalizePostal } from "@/lib/normalize";
import { keys, useCart, useMe } from "@/lib/queries";

import { AddressFields, EMPTY_ADDRESS, type AddressValue } from "./AddressFields";

const contactSchema = z.object({
  name: z.string().trim().min(2, "نام و نام خانوادگی را وارد کنید.").max(120),
  phone: z.string().refine((v) => normalizeMobile(v) !== null, "شمارهٔ موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)."),
  email: z.email("ایمیل معتبر وارد کنید."),
});
const addressSchema = z.object({
  recipient_name: z.string().trim().min(2, "نام گیرنده را وارد کنید.").max(120),
  phone: z.string().refine((v) => normalizeMobile(v) !== null, "شمارهٔ موبایل معتبر نیست."),
  province: z.string().min(1, "استان را انتخاب کنید."),
  city: z.string().trim().min(2, "شهر را وارد کنید."),
  postal_code: z.string().refine((v) => normalizePostal(v) !== null, "کد پستی باید ۱۰ رقم باشد."),
  line: z.string().trim().min(8, "نشانی کامل را وارد کنید.").max(300),
  plaque: z.string().max(20),
  unit: z.string().max(20),
});

const SAMPLE_CONTACT = { name: "سارا محمدی", phone: "۰۹۱۲۱۲۳۴۵۶۷", email: "sample.buyer@example.com" };
const SAMPLE_ADDRESS: AddressValue = {
  recipient_name: "سارا محمدی",
  phone: "۰۹۱۲۱۲۳۴۵۶۷",
  province: "تهران",
  city: "تهران",
  postal_code: "۱۴۳۵۹۱۶۴۷۱",
  line: "خیابان ولیعصر، کوچهٔ نمونه، پلاک ۱۲",
  plaque: "۱۲",
  unit: "۳",
};

function issuesToErrors(issues: z.ZodError["issues"], prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[`${prefix}.${String(i.path[0])}`] ??= i.message;
  return out;
}

export function CheckoutFlow({ devTools }: { devTools: boolean }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: cart, isLoading: cartLoading, isError: cartError, refetch: refetchCart } = useCart();
  const user = me?.authenticated ? me.user : null;

  const [step, setStep] = useState(0);
  // Defaults are derived from the profile/saved addresses; edits override them (no sync effects).
  const [contactEdits, setContact] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [addressChoice, setAddressId] = useState<string | "new" | null>(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shippingChoice, setShipping] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<OrderDetail | null>(null);
  const orderKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const addresses = useQuery({ queryKey: keys.addresses, queryFn: () => api<Address[]>("/account/addresses"), enabled: Boolean(user) });

  const contact = useMemo(() => contactEdits ?? { name: user ? `${user.first_name} ${user.last_name}`.trim() : "", phone: user?.phone ?? "", email: user?.email ?? "" }, [contactEdits, user]);
  const defaultAddressId = addresses.data ? ((addresses.data.find((a) => a.is_default) ?? addresses.data[0])?.id ?? "new") : null;
  const addressId = addressChoice ?? defaultAddressId;

  const quote = useQuery({
    queryKey: ["quote", cart?.version, coupon, shippingChoice, contact.email],
    queryFn: () => api<Quote>("/checkout/quote", { method: "POST", body: { coupon_code: coupon, shipping_method: shippingChoice ?? "", email: contact.email } }),
    enabled: Boolean(cart && cart.items.length),
    retry: false,
  });
  const q = quote.data;
  const shipping = shippingChoice ?? q?.shipping_method ?? null;
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const payload = useMemo(() => {
    const useSaved = user && addressId && addressId !== "new";
    return {
      contact: { name: contact.name, phone: contact.phone, email: contact.email },
      ...(useSaved ? { address_id: addressId } : { address, save_address: Boolean(user) && saveAddress }),
      shipping_method: shipping ?? "",
      coupon_code: coupon,
      note,
      quote_fingerprint: q?.fingerprint ?? "",
    };
  }, [user, addressId, contact, address, saveAddress, shipping, coupon, note, q?.fingerprint]);

  // A new payload (after any edit or a changed quote) gets a new idempotency key.
  const payloadSig = JSON.stringify(payload);
  useEffect(() => {
    orderKey.current = null;
  }, [payloadSig]);

  const startPayment = useMutation({
    mutationFn: (orderId: string) =>
      api<{ redirect_url: string; mode: string }>(`/orders/${orderId}/pay`, { method: "POST", idempotencyKey: newIdempotencyKey() }),
    onSuccess: (res) => {
      window.location.assign(res.redirect_url);
    },
    onError: () => { submitting.current = false; },
  });

  const placeOrder = useMutation({
    mutationFn: () => {
      orderKey.current ??= newIdempotencyKey();
      return api<OrderDetail>("/checkout/orders", { method: "POST", body: payload, idempotencyKey: orderKey.current });
    },
    onSuccess: (order) => {
      setPlacedOrder(order);
      qc.invalidateQueries({ queryKey: keys.orders });
      startPayment.mutate(order.id);
    },
    onError: (err) => {
      submitting.current = false;
      if (err instanceof ApiError && (err.code === "quote_changed" || err.code === "quote_invalid" || err.code === "coupon_error")) {
        const fresh = err.body?.quote as Quote | undefined;
        if (fresh) qc.setQueryData(["quote", cart?.version, coupon, shippingChoice, contact.email], fresh);
        qc.invalidateQueries({ queryKey: keys.cart });
        quote.refetch();
        setNotice(err.code === "quote_changed" ? copy.quoteChanged : err.message);
      } else if (err instanceof ApiError && err.code === "validation_error") {
        setErrors(fieldErrors(err));
        setStep(0);
      }
    },
  });

  if (cartLoading) return <LoadingBlock className="min-h-[50vh]" />;
  if (cartError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorBlock message={bag.empty} onRetry={() => refetchCart()} />
      </div>
    );
  }
  if (!cart || (cart.items.length === 0 && !placedOrder)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyBlock title={copy.emptyCart} icon="bag" action={<ButtonLink href="/shop" variant="secondary">{bag.emptyCta}</ButtonLink>} />
      </div>
    );
  }

  const validateStep1 = (): boolean => {
    const next: Record<string, string> = {};
    const c = contactSchema.safeParse(contact);
    if (!c.success) Object.assign(next, issuesToErrors(c.error.issues, "contact"));
    if (!(user && addressId && addressId !== "new")) {
      const a = addressSchema.safeParse(address);
      if (!a.success) Object.assign(next, issuesToErrors(a.error.issues, "address"));
    }
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] select`)?.focus());
      return false;
    }
    return true;
  };

  const savedAddress = addresses.data?.find((a) => a.id === addressId);
  const shippingOption = q?.shipping_options.find((o) => o.code === shipping);
  const busy = placeOrder.isPending || startPayment.isPending;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line-soft pb-6">
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        {devTools && step === 0 ? (
          <button
            type="button"
            onClick={() => {
              setContact(SAMPLE_CONTACT);
              setAddress(SAMPLE_ADDRESS);
              setAddressId("new");
            }}
            className="flex items-center gap-2 border border-dashed border-warning px-3 py-1.5 text-sm text-warning"
            data-testid="fill-sample"
          >
            {copy.sample}
            <span className="text-xs">({copy.sampleNote})</span>
          </button>
        ) : null}
      </div>

      <ol className="mb-10 grid grid-cols-3 gap-2 text-sm" aria-label="مراحل خرید">
        {copy.steps.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className={`border-t-2 pt-3 ${i <= step ? "border-ink text-ink" : "border-line text-muted"}`}>
            <span className="num me-1">{faDigits(i + 1)}.</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="mb-6 text-xl font-semibold outline-none">
            {copy.steps[step]}
          </h2>

          {step === 0 ? (
            <form
              noValidate
              className="flex flex-col gap-8"
              onSubmit={(e) => {
                e.preventDefault();
                if (validateStep1()) setStep(1);
              }}
            >
              {!user ? (
                <Notice>
                  {copy.guestNote}{" "}
                  <Link href="/login?next=/checkout" className="underline decoration-accent decoration-2 underline-offset-4">
                    {copy.loginToUseAddresses}
                  </Link>
                </Notice>
              ) : null}
              <fieldset className="flex flex-col gap-4">
                <legend className="mb-4 font-medium">{copy.contact}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div data-field="contact.name">
                    <TextField label={copy.name} required autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} error={errors["contact.name"]} maxLength={120} />
                  </div>
                  <div data-field="contact.phone">
                    <TextField
                      label={copy.phone}
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      ltr
                      hint={copy.phoneHint}
                      value={contact.phone}
                      onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                      error={errors["contact.phone"]}
                      maxLength={20}
                    />
                  </div>
                  <div data-field="contact.email" className="sm:col-span-2">
                    <TextField
                      label={copy.email}
                      required
                      type="email"
                      autoComplete="email"
                      ltr
                      hint={copy.emailHint}
                      value={contact.email}
                      onChange={(e) => setContact({ ...contact, email: e.target.value })}
                      error={errors["contact.email"]}
                      maxLength={254}
                      readOnly={Boolean(user)}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-4">
                <legend className="mb-4 font-medium">{copy.address}</legend>
                {user && addresses.data && addresses.data.length > 0 ? (
                  <div className="flex flex-col gap-2" role="radiogroup" aria-label={copy.savedAddresses}>
                    {addresses.data.map((a) => (
                      <label key={a.id} className={`flex cursor-pointer gap-3 border p-4 text-sm ${addressId === a.id ? "border-ink" : "border-line"}`}>
                        <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 accent-ink" />
                        <span>
                          <span className="font-medium">{a.title || a.recipient_name}</span>
                          <span className="block text-ink-soft">
                            {a.province}، {a.city}، {a.line}
                          </span>
                          <span className="ltr block text-muted">{faDigits(a.postal_code)}</span>
                        </span>
                      </label>
                    ))}
                    <label className={`flex cursor-pointer gap-3 border p-4 text-sm ${addressId === "new" ? "border-ink" : "border-line"}`}>
                      <input type="radio" name="address" checked={addressId === "new"} onChange={() => setAddressId("new")} className="accent-ink" />
                      {copy.newAddress}
                    </label>
                  </div>
                ) : null}
                {!user || addressId === "new" || (addresses.data && addresses.data.length === 0) ? (
                  <>
                    <AddressFields value={address} onChange={setAddress} errors={errors} />
                    {user ? <Checkbox label={copy.saveAddress} checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> : null}
                  </>
                ) : null}
              </fieldset>
              <Button type="submit" size="lg" className="self-start" icon={<Icon name="arrow" />}>
                {copy.next}
              </Button>
            </form>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-8">
              <fieldset>
                <legend className="mb-4 font-medium">{copy.shippingMethod}</legend>
                {quote.isLoading ? <LoadingBlock /> : null}
                <div className="flex flex-col gap-3" role="radiogroup">
                  {q?.shipping_options.map((o) => (
                    <label key={o.code} className={`flex cursor-pointer items-start gap-3 border p-4 ${shipping === o.code ? "border-ink" : "border-line"}`}>
                      <input type="radio" name="shipping" checked={shipping === o.code} onChange={() => setShipping(o.code)} className="mt-1.5 accent-ink" data-testid={`shipping-${o.code}`} />
                      <span className="flex flex-1 flex-col gap-1">
                        <span className="flex justify-between gap-3 font-medium">
                          {o.name}
                          <span className="num">{o.is_free ? copy.shippingFree : toman(o.fee_toman)}</span>
                        </span>
                        <span className="text-sm text-ink-soft">{o.eta_text}</span>
                        <span className="text-xs text-muted">{o.free_threshold_toman !== null ? copy.freeOver(shortToman(o.free_threshold_toman)) : copy.neverFree}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <CouponBox
                value={couponInput}
                onChange={setCouponInput}
                applied={q?.coupon_code || ""}
                error={q?.coupon_error?.message}
                loading={quote.isFetching}
                onApply={() => setCoupon(couponInput.trim())}
                onRemove={() => {
                  setCoupon("");
                  setCouponInput("");
                }}
              />
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setStep(0)}>
                  {copy.back}
                </Button>
                <Button onClick={() => setStep(2)} disabled={!q || Boolean(q.coupon_error) || !shipping} icon={<Icon name="arrow" />}>
                  {copy.next}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-6">
              <section className="grid gap-4 border border-line p-5 text-sm sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-muted">{copy.contact}</p>
                  <p>{contact.name}</p>
                  <p className="ltr text-start">{contact.phone}</p>
                  <p className="ltr text-start">{contact.email}</p>
                </div>
                <div>
                  <p className="mb-1 text-muted">{copy.address}</p>
                  {savedAddress && addressId !== "new" ? (
                    <p>
                      {savedAddress.recipient_name} — {savedAddress.province}، {savedAddress.city}، {savedAddress.line}
                    </p>
                  ) : (
                    <p>
                      {address.recipient_name} — {address.province}، {address.city}، {address.line}
                    </p>
                  )}
                  <p className="mt-2 text-muted">
                    {copy.shippingMethod}: <span className="text-ink">{shippingOption?.name}</span>
                  </p>
                </div>
                <button type="button" onClick={() => setStep(0)} className="self-start text-start text-sm underline decoration-accent decoration-2 underline-offset-8 sm:col-span-2">
                  {copy.edit}
                </button>
              </section>
              <TextareaField label={copy.note} optionalLabel="اختیاری" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
              {notice ? <Notice tone="warning">{notice}</Notice> : null}
              {placeOrder.isError && !(placeOrder.error instanceof ApiError && ["quote_changed", "quote_invalid", "coupon_error", "validation_error"].includes(placeOrder.error.code)) ? (
                <ErrorBlock message={errorMessage(placeOrder.error)} />
              ) : null}
              {startPayment.isError ? (
                <div className="flex flex-col gap-3">
                  <ErrorBlock message={errorMessage(startPayment.error)} />
                  {placedOrder ? (
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => startPayment.mutate(placedOrder.id)} loading={startPayment.isPending}>
                        پرداخت دوباره
                      </Button>
                      <ButtonLink href={`/account/orders/${placedOrder.id}`} variant="secondary">
                        مشاهدهٔ سفارش
                      </ButtonLink>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-muted">{copy.holdNote(faDigits(15))}</p>
              <p className="text-xs text-muted">
                {copy.termsNote}{" "}
                <Link href="/pages/terms" className="underline">
                  قوانین
                </Link>
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
                  {copy.back}
                </Button>
                {!placedOrder ? (
                  <Button size="lg" onClick={() => { if (submitting.current) return; submitting.current = true; placeOrder.mutate(); }} loading={busy} disabled={!q?.purchasable || busy} data-testid="pay-button" icon={<Icon name="lock" />}>
                    {busy ? (placeOrder.isPending ? copy.placing : copy.redirecting) : `${copy.pay} ${q ? toman(q.total_toman) : ""}`}
                  </Button>
                ) : null}
              </div>
              <p className="flex items-center gap-2 text-xs text-muted">
                <Icon name="shield" className="size-4" />
                {copy.payWith}
              </p>
            </div>
          ) : null}
        </div>

        <OrderSummary quote={q} loading={quote.isLoading} error={quote.isError ? errorMessage(quote.error) : null} onRetry={() => quote.refetch()} />
      </div>
    </div>
  );
}

function CouponBox({
  value,
  onChange,
  applied,
  error,
  loading,
  onApply,
  onRemove,
}: {
  value: string;
  onChange: (v: string) => void;
  applied: string;
  error?: string;
  loading: boolean;
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onApply();
        }}
      >
        <div className="flex-1">
          <TextField label={copy.coupon} ltr value={value} onChange={(e) => onChange(e.target.value)} maxLength={32} autoCapitalize="characters" error={error} data-testid="coupon-input" />
        </div>
        <Button type="submit" variant="secondary" loading={loading} disabled={!value.trim()} className="mb-[1px]">
          {copy.applyCoupon}
        </Button>
      </form>
      {applied ? (
        <p className="flex items-center gap-3 text-sm text-success">
          <Icon name="check" className="size-4" />
          <span>
            کد <bdi className="ltr font-medium">{applied}</bdi> اعمال شد
          </span>
          <button type="button" onClick={onRemove} className="text-muted underline">
            {copy.removeCoupon}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function OrderSummary({ quote, loading, error, onRetry }: { quote?: Quote; loading: boolean; error: string | null; onRetry: () => void }) {
  return (
    <aside className="flex flex-col gap-4 self-start border border-line bg-elevated p-6 lg:sticky lg:top-6" aria-label={copy.summary}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{copy.summary}</h2>
        <Link href="/bag" className="text-xs text-muted underline">
          {copy.editCart}
        </Link>
      </div>
      {loading ? <LoadingBlock className="py-6" /> : null}
      {error ? <ErrorBlock message={error} onRetry={onRetry} /> : null}
      {quote ? (
        <>
          <ul className="flex flex-col gap-3 text-sm">
            {quote.lines.map((l) => (
              <li key={l.variant_id} className="flex justify-between gap-3">
                <span>
                  {l.product_name}
                  <span className="block text-xs text-muted">
                    {l.color_name} · سایز <bdi className="ltr">{sizeLabel(l.size)}</bdi> · {faDigits(l.quantity)} عدد
                  </span>
                  {l.issue ? <span className="block text-xs text-danger">ناموجود یا تغییر کرده</span> : null}
                </span>
                <span className="num shrink-0">{toman(l.line_total_toman)}</span>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-2 border-t border-line-soft pt-4 text-sm">
            <div className="flex justify-between">
              <dt>{bag.subtotal}</dt>
              <dd className="num">{toman(quote.subtotal_toman)}</dd>
            </div>
            {quote.discount_toman > 0 ? (
              <div className="flex justify-between text-success">
                <dt>
                  {bag.discount} (<bdi className="ltr">{quote.coupon_code}</bdi>)
                </dt>
                <dd className="num">− {toman(quote.discount_toman)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt>{bag.shipping}</dt>
              <dd className="num">{quote.shipping_toman === 0 ? bag.free : toman(quote.shipping_toman)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-line-soft pt-3 text-base font-semibold">
              <dt>{bag.total}</dt>
              <dd className="num" data-testid="quote-total">
                {toman(quote.total_toman)}
              </dd>
            </div>
          </dl>
          {quote.issues.length ? (
            <Notice tone="warning">
              <ul>
                {quote.issues.map((i, idx) => (
                  <li key={idx}>{i.message}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
