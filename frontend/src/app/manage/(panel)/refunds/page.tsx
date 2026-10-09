"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextareaField, TextField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import type { Paginated, RefundRow } from "@/lib/api/types";
import { jalali, toman } from "@/lib/format";
import { useCan } from "@/manage/ManageShell";
import { useReauth } from "@/manage/reauth";
import { FilterBar, MiniSelect, PageHeader, Pager, Table } from "@/manage/ui";

export default function RefundsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const withReauth = useReauth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ refund: RefundRow; action: "complete" | "fail" | "reject" } | null>(null);
  const [form, setForm] = useState({ reference: "", evidence_note: "", reason: "" });
  const list = useQuery({
    queryKey: ["manage", "refunds", status, page],
    queryFn: () => api<Paginated<RefundRow>>("/manage/refunds", { query: { status, page } }),
    placeholderData: (p) => p,
  });
  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: Record<string, string> }) =>
      withReauth(() => api<RefundRow>(`/manage/refunds/${id}/${action}`, { method: "POST", body: body ?? {} })),
    onSuccess: (r) => {
      toast.success(`وضعیت بازپرداخت: ${r.status_label}`);
      setDialog(null);
      qc.invalidateQueries({ queryKey: ["manage", "refunds"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const errors = fieldErrors(act.error);
  return (
    <div>
      <PageHeader title="بازپرداخت‌ها" subtitle="درخواست ← تأیید ← انجام دستی در پنل بانک/درگاه ← ثبت شمارهٔ مرجع" />
      <Notice className="mb-4">
        بازپرداخت خودکار از طریق API درگاه در این نسخه پیاده نشده است. «انجام‌شده» فقط پس از انجام واقعی بازپرداخت و ثبت شمارهٔ مرجع تراکنش ثبت می‌شود.
      </Notice>
      <FilterBar>
        <MiniSelect
          label="وضعیت"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[["", "همه"], ["requested", "درخواست‌شده"], ["approved", "تأییدشده"], ["processing", "در حال انجام"], ["completed", "انجام‌شده"], ["failed", "ناموفق"], ["rejected", "ردشده"]]}
        />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["سفارش", "مبلغ", "وضعیت", "دلیل", "مرجع", "ثبت‌کننده", "زمان", "عملیات"]} empty={!list.data.results.length}>
            {list.data.results.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <Link href={`/manage/orders/${r.order_id}`} className="ltr hover:underline">
                    {r.order_number}
                  </Link>
                  {r.is_test ? <Badge tone="warning">آزمایشی</Badge> : null}
                </td>
                <td className="num px-4 py-2">{toman(r.amount_toman)}</td>
                <td className="px-4 py-2">
                  <Badge tone={r.status === "completed" ? "success" : r.status === "failed" || r.status === "rejected" ? "danger" : "neutral"}>{r.status_label}</Badge>
                </td>
                <td className="px-4 py-2 text-xs">{r.reason}</td>
                <td className="ltr px-4 py-2 text-start text-xs">{r.reference || "—"}</td>
                <td className="px-4 py-2 text-xs">{r.requested_by}</td>
                <td className="px-4 py-2 text-xs">{jalali(r.created_at)}</td>
                <td className="px-4 py-2">
                  {can("refunds.manage") ? (
                    <span className="flex flex-wrap gap-2 text-xs">
                      {r.status === "requested" ? (
                        <>
                          <button type="button" className="underline" onClick={() => act.mutate({ id: r.id, action: "approve" })}>
                            تأیید
                          </button>
                          <button type="button" className="text-danger underline" onClick={() => setDialog({ refund: r, action: "reject" })}>
                            رد
                          </button>
                        </>
                      ) : null}
                      {r.status === "approved" ? (
                        <button type="button" className="underline" onClick={() => act.mutate({ id: r.id, action: "processing" })}>
                          شروع انجام
                        </button>
                      ) : null}
                      {r.status === "approved" || r.status === "processing" ? (
                        <>
                          <button type="button" className="underline" onClick={() => setDialog({ refund: r, action: "complete" })}>
                            ثبت انجام
                          </button>
                          <button type="button" className="text-danger underline" onClick={() => setDialog({ refund: r, action: "fail" })}>
                            ناموفق
                          </button>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={list.data.total_pages} onChange={setPage} />
        </>
      ) : null}
      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} title={dialog?.action === "complete" ? "ثبت انجام بازپرداخت" : "ثبت دلیل"} size="sm">
        {dialog ? (
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              act.mutate({
                id: dialog.refund.id,
                action: dialog.action,
                body: dialog.action === "complete" ? { reference: form.reference, evidence_note: form.evidence_note } : { reason: form.reason },
              });
            }}
          >
            <p className="num text-sm">مبلغ: {toman(dialog.refund.amount_toman)}</p>
            {dialog.action === "complete" ? (
              <>
                <TextField label="شمارهٔ مرجع تراکنش بازپرداخت" ltr required value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} error={errors.reference} maxLength={80} />
                <TextareaField label="شرح مستند (مثلاً از پنل درگاه/بانک)" value={form.evidence_note} onChange={(e) => setForm({ ...form, evidence_note: e.target.value })} maxLength={500} />
              </>
            ) : (
              <TextareaField label="دلیل" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} error={errors.reason} maxLength={300} />
            )}
            <Button type="submit" loading={act.isPending}>
              ثبت
            </Button>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
