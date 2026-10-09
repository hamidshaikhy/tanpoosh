"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextareaField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { faDigits, jalali, sizeLabel, toman } from "@/lib/format";
import { useCan } from "@/manage/ManageShell";
import { useReauth } from "@/manage/reauth";
import { FilterBar, MiniSelect, PageHeader, Pager, Table } from "@/manage/ui";

type ReturnRow = {
  id: string;
  order_id: string;
  order_number: string;
  status: string;
  status_label: string;
  reason_label: string;
  description: string;
  staff_note: string;
  created_at: string;
  suggested_refund_toman: number;
  items: { id: number; product_name: string; color_name: string; size: string; sku: string; quantity: number; accepted_quantity: number | null; restock_quantity: number }[];
};

export default function ReturnsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const withReauth = useReauth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ReturnRow | null>(null);
  const list = useQuery({
    queryKey: ["manage", "returns", status, page],
    queryFn: () => api<Paginated<ReturnRow>>("/manage/returns", { query: { status, page } }),
    placeholderData: (p) => p,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["manage", "returns"] });
  return (
    <div>
      <PageHeader title="مرجوعی‌ها" />
      <FilterBar>
        <MiniSelect
          label="وضعیت"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[["", "همه"], ["requested", "ثبت‌شده"], ["approved", "تأییدشده"], ["received", "دریافت‌شده"], ["rejected", "ردشده"], ["closed", "بسته"]]}
        />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["سفارش", "دلیل", "اقلام", "وضعیت", "زمان", ""]} empty={!list.data.results.length}>
            {list.data.results.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <Link href={`/manage/orders/${r.order_id}`} className="ltr hover:underline">
                    {r.order_number}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.reason_label}</td>
                <td className="num px-4 py-2">{faDigits(r.items.reduce((a, i) => a + i.quantity, 0))}</td>
                <td className="px-4 py-2">
                  <Badge>{r.status_label}</Badge>
                </td>
                <td className="px-4 py-2 text-xs">{jalali(r.created_at)}</td>
                <td className="px-4 py-2">
                  <button type="button" className="underline" onClick={() => setOpen(r)}>
                    بررسی
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={list.data.total_pages} onChange={setPage} />
        </>
      ) : null}
      {open ? <ReturnDialog row={open} canManage={can("returns.manage")} canRefund={can("refunds.manage")} withReauth={withReauth} onClose={() => setOpen(null)} onChanged={() => { refresh(); setOpen(null); }} /> : null}
    </div>
  );
}

function ReturnDialog({
  row,
  canManage,
  canRefund,
  withReauth,
  onClose,
  onChanged,
}: {
  row: ReturnRow;
  canManage: boolean;
  canRefund: boolean;
  withReauth: <T>(fn: () => Promise<T>) => Promise<T>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [lines, setLines] = useState(row.items.map((i) => ({ return_item_id: i.id, accepted_quantity: i.quantity, restock_quantity: i.quantity })));
  const decide = useMutation({
    mutationFn: (approve: boolean) => api(`/manage/returns/${row.id}/decide`, { method: "POST", body: { approve, note } }),
    onSuccess: onChanged,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const receive = useMutation({
    mutationFn: () => api(`/manage/returns/${row.id}/receive`, { method: "POST", body: { items: lines, note } }),
    onSuccess: () => {
      toast.success("دریافت کالا ثبت شد و موجودی قابل فروش به انبار برگشت.");
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const refund = useMutation({
    mutationFn: () =>
      withReauth(() =>
        api(`/manage/orders/${row.order_id}/refunds`, { method: "POST", body: { amount_toman: row.suggested_refund_toman, reason: `مرجوعی ${row.order_number}`, return_id: row.id } }),
      ),
    onSuccess: () => {
      toast.success("درخواست بازپرداخت ثبت شد.");
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onClose={onClose} title={`مرجوعی سفارش ${row.order_number}`} size="lg">
      <div className="flex flex-col gap-4 p-5 text-sm">
        <p>
          دلیل: {row.reason_label} {row.description ? `— ${row.description}` : ""}
        </p>
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {row.items.map((i, idx) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                {i.product_name} — {i.color_name} — <bdi className="ltr">{sizeLabel(i.size)}</bdi> · درخواست: {faDigits(i.quantity)}
              </span>
              {row.status === "approved" && canManage ? (
                <span className="flex items-center gap-2 text-xs">
                  پذیرفته
                  <input type="number" min={0} max={i.quantity} value={lines[idx].accepted_quantity} onChange={(e) => setLines(lines.map((l, j) => (j === idx ? { ...l, accepted_quantity: Number(e.target.value), restock_quantity: Math.min(l.restock_quantity, Number(e.target.value)) } : l)))} className="h-8 w-14 border border-line px-1" />
                  قابل فروش مجدد
                  <input type="number" min={0} max={lines[idx].accepted_quantity} value={lines[idx].restock_quantity} onChange={(e) => setLines(lines.map((l, j) => (j === idx ? { ...l, restock_quantity: Number(e.target.value) } : l)))} className="h-8 w-14 border border-line px-1" />
                </span>
              ) : i.accepted_quantity !== null ? (
                <span className="text-xs text-muted">
                  پذیرفته {faDigits(i.accepted_quantity)} · برگشت به انبار {faDigits(i.restock_quantity)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="num">مبلغ پیشنهادی بازپرداخت (پس از سهم تخفیف): {toman(row.suggested_refund_toman)}</p>
        {row.staff_note ? <Notice>{row.staff_note}</Notice> : null}
        {canManage && ["requested", "approved"].includes(row.status) ? <TextareaField label="یادداشت برای مشتری" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /> : null}
        <div className="flex flex-wrap gap-3">
          {canManage && row.status === "requested" ? (
            <>
              <Button onClick={() => decide.mutate(true)} loading={decide.isPending}>
                تأیید درخواست
              </Button>
              <Button variant="secondary" onClick={() => decide.mutate(false)} loading={decide.isPending}>
                رد درخواست
              </Button>
            </>
          ) : null}
          {canManage && row.status === "approved" ? (
            <Button onClick={() => receive.mutate()} loading={receive.isPending}>
              ثبت دریافت کالا
            </Button>
          ) : null}
          {canRefund && row.status === "received" && row.suggested_refund_toman > 0 ? (
            <Button variant="secondary" onClick={() => refund.mutate()} loading={refund.isPending}>
              ایجاد درخواست بازپرداخت
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
