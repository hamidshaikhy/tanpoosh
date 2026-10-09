"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { payment as copy } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import { groupNumber } from "@/lib/format";

export function MockGateway({ authority }: { authority: string | null }) {
  const info = useQuery({
    queryKey: ["mock-gateway", authority],
    queryFn: () => api<{ amount: number; currency: string; state: string; order_number: string; notice: string }>(`/payments/mock/${authority}`),
    enabled: Boolean(authority),
    retry: false,
  });
  const complete = useMutation({
    mutationFn: (outcome: "success" | "failure" | "cancel") =>
      api<{ redirect_url: string }>(`/payments/mock/${authority}/complete`, { method: "POST", body: { outcome } }),
    onSuccess: (r) => window.location.assign(r.redirect_url),
  });
  if (!authority) return <div className="mx-auto max-w-lg px-4 py-20"><ErrorBlock message="درگاه آزمایشی در دسترس نیست." /></div>;
  if (info.isLoading) return <LoadingBlock className="min-h-[50vh]" />;
  if (info.isError) return <div className="mx-auto max-w-lg px-4 py-20"><ErrorBlock message="درگاه آزمایشی فعال نیست (فقط در محیط توسعه/آزمون)." /></div>;
  const d = info.data!;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
      <Notice tone="warning">{copy.mockNotice}</Notice>
      <div className="border border-line bg-elevated p-6">
        <h1 className="text-xl font-bold">{copy.mockTitle}</h1>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">سفارش</dt>
            <dd className="ltr">{d.order_number}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">مبلغ ارسالی به درگاه</dt>
            <dd className="num">
              {groupNumber(d.amount)} <span className="ltr">{d.currency}</span>
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => complete.mutate("success")} loading={complete.isPending} data-testid="mock-success">
            {copy.mockSuccess}
          </Button>
          <Button variant="secondary" onClick={() => complete.mutate("failure")} disabled={complete.isPending} data-testid="mock-failure">
            {copy.mockFailure}
          </Button>
          <Button variant="ghost" onClick={() => complete.mutate("cancel")} disabled={complete.isPending} data-testid="mock-cancel">
            {copy.mockCancel}
          </Button>
        </div>
        {complete.isError ? <p className="mt-3 text-sm text-danger">{errorMessage(complete.error)}</p> : null}
      </div>
    </div>
  );
}
