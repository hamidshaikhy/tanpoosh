"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { checkout, payment as copy } from "@/content/fa";
import { api, ApiError, errorMessage, newIdempotencyKey } from "@/lib/api/client";
import type { PaymentStatus } from "@/lib/api/types";
import { toman } from "@/lib/format";
import { keys } from "@/lib/queries";

/**
 * Shows the server-verified outcome. The browser return itself proves nothing; this page only
 * reads the order's payment state (owned via session) and polls while it is unresolved.
 */
export function PaymentResult({ orderId }: { orderId: string | null }) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["payment-status", orderId],
    queryFn: () => api<PaymentStatus>(`/orders/${orderId}/payment-status`),
    enabled: Boolean(orderId),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      const unresolved = d.payment_status === "pending" || (d.last_attempt && ["verifying", "unknown", "redirected"].includes(d.last_attempt.status));
      return unresolved && q.state.dataUpdateCount < 40 ? 3000 : false;
    },
  });
  useEffect(() => {
    if (status.data?.payment_status === "verified") qc.invalidateQueries({ queryKey: keys.cart });
  }, [status.data?.payment_status, qc]);

  const retry = useMutation({
    mutationFn: () => api<{ redirect_url: string }>(`/orders/${orderId}/pay`, { method: "POST", idempotencyKey: newIdempotencyKey() }),
    onSuccess: (r) => window.location.assign(r.redirect_url),
  });

  if (!orderId || (status.error instanceof ApiError && status.error.status === 404)) {
    return (
      <Shell icon="info" tone="neutral" title={copy.unknown} body={copy.unknownBody}>
        <ButtonLink href="/orders/track" variant="secondary">
          پیگیری سفارش
        </ButtonLink>
      </Shell>
    );
  }
  if (status.isLoading) return <LoadingBlock label={copy.checking} className="min-h-[50vh]" />;
  if (status.isError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorBlock message={errorMessage(status.error)} onRetry={() => status.refetch()} />
      </div>
    );
  }
  const d = status.data!;
  const unresolved = d.payment_status === "pending" || (d.last_attempt && ["verifying", "unknown"].includes(d.last_attempt.status));
  const view =
    d.payment_status === "verified"
      ? { icon: "check" as const, tone: "success" as const, title: copy.success, body: copy.successBody }
      : d.payment_status === "needs_review"
        ? { icon: "info" as const, tone: "neutral" as const, title: copy.review, body: copy.reviewBody }
        : unresolved
          ? { icon: "info" as const, tone: "neutral" as const, title: copy.pending, body: copy.pendingBody }
          : d.payment_status === "cancelled"
            ? { icon: "alert" as const, tone: "danger" as const, title: copy.cancelled, body: "" }
            : { icon: "alert" as const, tone: "danger" as const, title: copy.failed, body: copy.failedBody };

  return (
    <Shell {...view}>
      <dl className="grid w-full max-w-sm gap-2 border-y border-line-soft py-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">{copy.orderNumber}</dt>
          <dd className="ltr font-medium">{d.number}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{copy.amount}</dt>
          <dd className="num">{toman(d.total_toman)}</dd>
        </div>
        {d.payment_reference ? (
          <div className="flex justify-between">
            <dt className="text-muted">{copy.reference}</dt>
            <dd className="ltr">{d.payment_reference}</dd>
          </div>
        ) : null}
      </dl>
      {d.is_test || (d.last_attempt && d.last_attempt.mode !== "live") ? (
        <Badge tone="warning">{d.last_attempt?.mode === "mock" ? checkout.mockBadge : checkout.sandboxBadge}</Badge>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        {d.can_pay && !unresolved && d.payment_status !== "verified" ? (
          <Button onClick={() => retry.mutate()} loading={retry.isPending}>
            {copy.retry}
          </Button>
        ) : null}
        <ButtonLink href={`/orders/${d.order_id}`} variant="secondary">
          {copy.viewOrder}
        </ButtonLink>
      </div>
      {retry.isError ? <p className="text-sm text-danger">{errorMessage(retry.error)}</p> : null}
    </Shell>
  );
}

function Shell({
  icon,
  tone,
  title,
  body,
  children,
}: {
  icon: "check" | "alert" | "info";
  tone: "success" | "danger" | "neutral";
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const ring = tone === "success" ? "bg-success-bg text-success" : tone === "danger" ? "bg-danger-bg text-danger" : "bg-surface-alt text-ink";
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-20 text-center" role="status" aria-live="polite">
      <span className={`flex size-16 items-center justify-center rounded-full ${ring}`}>
        <Icon name={icon} className="size-8" />
      </span>
      <h1 className="text-2xl font-bold">{title}</h1>
      {body ? <p className="leading-8 text-ink-soft">{body}</p> : null}
      {children}
    </div>
  );
}
