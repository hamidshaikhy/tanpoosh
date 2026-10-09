"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, errorMessage } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { faDigits, jalali, toman } from "@/lib/format";
import { useCan } from "@/manage/ManageShell";
import { useReauth } from "@/manage/reauth";
import { FilterBar, MiniSelect, PageHeader, Pager, SearchInput, Table } from "@/manage/ui";

type Row = {
  id: string;
  order_id: string;
  order_number: string;
  provider: string;
  mode: string;
  status: string;
  status_label: string;
  amount_toman: number;
  provider_amount: number;
  provider_currency: string;
  ref_id: string;
  authority: string | null;
  provider_code: number | null;
  failure_reason: string;
  created_at: string;
  verified_at: string | null;
  last_checked_at: string | null;
  check_count: number;
};

function PaymentsInner() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const can = useCan();
  const withReauth = useReauth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [mode, setMode] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDeferredValue(q);
  const list = useQuery({
    queryKey: ["manage", "payments", dq, status, mode, page],
    queryFn: () => api<Paginated<Row>>("/manage/payments", { query: { q: dq, status, mode, page } }),
    placeholderData: (p) => p,
  });
  const reconcile = useMutation({
    mutationFn: (id: string) => api<Row>(`/manage/payments/${id}/reconcile`, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`نتیجهٔ استعلام: ${r.status_label}`);
      qc.invalidateQueries({ queryKey: ["manage", "payments"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reconcileAll = useMutation({
    mutationFn: () => api<{ checked: number }>("/manage/payments/reconcile", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`${faDigits(r.checked)} تراکنش بررسی شد.`);
      qc.invalidateQueries({ queryKey: ["manage", "payments"] });
    },
  });
  const exportCsv = useMutation({
    mutationFn: () =>
      withReauth(async () => {
        const res = await fetch(`/api/v1/manage/payments/export?mode=${encodeURIComponent(mode)}`, { credentials: "same-origin" });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new ApiError(res.status, body?.error ?? null, "خطا در خروجی");
        }
        return res.blob();
      }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tanpoosh-payments.csv";
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="پرداخت‌ها"
        subtitle="ثبت تراکنش‌ها فقط‌خواندنی است؛ هیچ وضعیت، مبلغ یا کد مرجعی از پنل قابل ویرایش نیست."
        actions={
          <>
            {can("payments.reconcile") ? (
              <Button size="sm" variant="secondary" onClick={() => reconcileAll.mutate()} loading={reconcileAll.isPending}>
                استعلام تراکنش‌های نامشخص
              </Button>
            ) : null}
            {can("payments.export") ? (
              <Button size="sm" variant="secondary" onClick={() => exportCsv.mutate()} loading={exportCsv.isPending}>
                خروجی CSV (۳۱ روز)
              </Button>
            ) : null}
          </>
        }
      />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="شمارهٔ سفارش، کد پیگیری، authority" />
        <MiniSelect
          label="وضعیت"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[["", "همه"], ["redirected", "در درگاه"], ["verifying", "در حال تأیید"], ["verified", "تأییدشده"], ["failed", "ناموفق"], ["cancelled", "لغو/منقضی"], ["unknown", "نامشخص"], ["request_failed", "خطای اتصال"]]}
        />
        <MiniSelect label="حالت" value={mode} onChange={(v) => { setMode(v); setPage(1); }} options={[["", "همه"], ["live", "Live"], ["sandbox", "Sandbox"], ["mock", "Mock (توسعه)"]]} />
      </FilterBar>
      <Notice className="mb-4">تراکنش‌های Sandbox و Mock آزمایشی هستند و در گزارش درآمد واقعی محاسبه نمی‌شوند.</Notice>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["سفارش", "زمان", "حالت", "وضعیت", "مبلغ مورد انتظار", "مبلغ ارسالی", "کد پیگیری", "استعلام", ""]} empty={!list.data.results.length}>
            {list.data.results.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <Link href={`/manage/orders/${r.order_id}`} className="ltr underline-offset-4 hover:underline">
                    {r.order_number}
                  </Link>
                </td>
                <td className="px-4 py-2 text-xs">{jalali(r.created_at, { time: true })}</td>
                <td className="px-4 py-2">
                  <Badge tone={r.mode === "live" ? "dark" : "warning"}>{r.mode}</Badge>
                </td>
                <td className="px-4 py-2">
                  {r.status_label}
                  {r.failure_reason ? <span className="block text-xs text-danger">{r.failure_reason}</span> : null}
                </td>
                <td className="num px-4 py-2">{toman(r.amount_toman)}</td>
                <td className="num px-4 py-2">
                  {faDigits(r.provider_amount)} <span className="ltr text-xs">{r.provider_currency}</span>
                </td>
                <td className="ltr px-4 py-2 text-start text-xs">{r.ref_id || "—"}</td>
                <td className="px-4 py-2 text-xs text-muted">{r.last_checked_at ? `${jalali(r.last_checked_at, { time: true })} (${faDigits(r.check_count)})` : "—"}</td>
                <td className="px-4 py-2">
                  {can("payments.reconcile") && ["redirected", "verifying", "unknown", "created"].includes(r.status) ? (
                    <button type="button" className="underline" onClick={() => reconcile.mutate(r.id)}>
                      استعلام
                    </button>
                  ) : null}
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

export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsInner />
    </Suspense>
  );
}
