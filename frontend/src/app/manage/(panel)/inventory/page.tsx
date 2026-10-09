"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField, TextField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { faDigits, jalali, sizeLabel, toAsciiDigits } from "@/lib/format";
import { useCan } from "@/manage/ManageShell";
import { FilterBar, MiniSelect, PageHeader, Pager, SearchInput, Table } from "@/manage/ui";

type Row = {
  variant_id: number;
  product_id: number;
  product_name: string;
  product_status: string;
  color_name: string;
  size: string;
  sku: string;
  is_active: boolean;
  on_hand: number;
  reserved: number;
  available: number;
  low_stock_threshold: number;
  is_low: boolean;
  version: number;
};
type Movement = { id: number; kind_label: string; delta_on_hand: number; delta_reserved: number; on_hand_after: number; reserved_after: number; reason: string; reference: string; actor: string; created_at: string };

function InventoryInner() {
  const params = useSearchParams();
  const can = useCan();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [low, setLow] = useState(params.get("low") === "1" ? "1" : "");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const dq = useDeferredValue(q);
  const list = useQuery({
    queryKey: ["manage", "inventory", dq, low, page],
    queryFn: () => api<Paginated<Row>>("/manage/inventory", { query: { q: dq, low, page } }),
    placeholderData: (p) => p,
  });
  return (
    <div>
      <PageHeader title="موجودی انبار" subtitle="موجود = در انبار − رزروشده برای سفارش‌های در انتظار پرداخت" />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="نام محصول یا SKU" />
        <MiniSelect label="نمایش" value={low} onChange={(v) => { setLow(v); setPage(1); }} options={[["", "همه"], ["1", "فقط کم‌موجود"]]} />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["محصول", "رنگ / سایز", "SKU", "در انبار", "رزرو", "قابل فروش", "حد هشدار", ""]} empty={!list.data.results.length}>
            {list.data.results.map((r) => (
              <tr key={r.variant_id} className={r.is_active ? "" : "opacity-50"}>
                <td className="px-4 py-2">{r.product_name}</td>
                <td className="px-4 py-2">
                  {r.color_name} / <bdi className="ltr">{sizeLabel(r.size)}</bdi>
                </td>
                <td className="ltr px-4 py-2 text-start text-xs">{r.sku}</td>
                <td className="num px-4 py-2">{faDigits(r.on_hand)}</td>
                <td className="num px-4 py-2">{faDigits(r.reserved)}</td>
                <td className="num px-4 py-2">
                  {faDigits(r.available)} {r.is_low ? <Badge tone="warning">کم</Badge> : null}
                </td>
                <td className="num px-4 py-2">{faDigits(r.low_stock_threshold)}</td>
                <td className="px-4 py-2">
                  <span className="flex gap-3">
                    {can("inventory.adjust") ? (
                      <button type="button" className="underline" onClick={() => setAdjusting(r)} data-testid="adjust-stock">
                        تغییر
                      </button>
                    ) : null}
                    <button type="button" className="underline" onClick={() => setHistory(r)}>
                      سوابق
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={list.data.total_pages} onChange={setPage} />
        </>
      ) : null}
      {adjusting ? (
        <AdjustDialog
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={() => {
            setAdjusting(null);
            qc.invalidateQueries({ queryKey: ["manage", "inventory"] });
          }}
        />
      ) : null}
      {history ? <HistoryDialog row={history} onClose={() => setHistory(null)} /> : null}
    </div>
  );
}

function AdjustDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState("adjustment");
  const adjust = useMutation({
    mutationFn: () =>
      api(`/manage/inventory/${row.variant_id}/adjust`, {
        method: "POST",
        body: { delta: Number(toAsciiDigits(delta)), reason, kind, expected_version: row.version },
      }),
    onSuccess: () => {
      toast.success("موجودی به‌روز شد.");
      onDone();
    },
  });
  const errors = fieldErrors(adjust.error);
  return (
    <Dialog open onClose={onClose} title={`تغییر موجودی — ${row.product_name}`} size="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          adjust.mutate();
        }}
      >
        <p className="text-sm text-ink-soft">
          در انبار: {faDigits(row.on_hand)} · رزرو: {faDigits(row.reserved)}
        </p>
        <SelectField label="نوع" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="adjustment">اصلاح دستی (+/−)</option>
          <option value="receive">ورود کالا (+)</option>
        </SelectField>
        <TextField label="مقدار تغییر (مثلاً ۵ یا −۲)" ltr value={delta} onChange={(e) => setDelta(e.target.value)} error={errors.delta} required />
        <TextField label="دلیل (الزامی؛ در گزارش ثبت می‌شود)" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} required maxLength={300} />
        {adjust.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(adjust.error)}</Notice> : null}
        <Button type="submit" loading={adjust.isPending} disabled={!delta || !reason}>
          ثبت تغییر
        </Button>
      </form>
    </Dialog>
  );
}

function HistoryDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const list = useQuery({ queryKey: ["manage", "movements", row.variant_id], queryFn: () => api<Paginated<Movement>>(`/manage/inventory/${row.variant_id}/movements`) });
  return (
    <Dialog open onClose={onClose} title={`سوابق موجودی — ${row.sku}`} size="lg">
      <div className="p-5">
        {list.isLoading ? <LoadingBlock /> : null}
        <ul className="divide-y divide-line-soft text-sm">
          {list.data?.results.map((m) => (
            <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                {m.kind_label}
                {m.reason ? <span className="text-muted"> — {m.reason}</span> : null}
                {m.reference ? <span className="ltr text-xs text-muted"> ({m.reference})</span> : null}
              </span>
              <span className="num text-xs text-ink-soft">
                Δ موجودی {faDigits(m.delta_on_hand)} · Δ رزرو {faDigits(m.delta_reserved)} → {faDigits(m.on_hand_after)}/{faDigits(m.reserved_after)} · {m.actor} · {jalali(m.created_at, { time: true })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryInner />
    </Suspense>
  );
}
