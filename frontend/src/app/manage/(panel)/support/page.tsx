"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField, TextareaField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { jalali } from "@/lib/format";
import { FilterBar, MiniSelect, PageHeader, Pager, SearchInput, Table } from "@/manage/ui";

type Row = { id: string; name: string; email: string; topic_label: string; subject: string; order_number: string; status: string; status_label: string; is_customer: boolean; created_at: string };
type Detail = Row & { body: string; staff_note: string; replies: { body: string; author: string; created_at: string; emailed: boolean }[] };

export default function SupportInbox() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDeferredValue(q);
  const list = useQuery({ queryKey: ["manage", "support", status, dq, page], queryFn: () => api<Paginated<Row>>("/manage/support", { query: { status, q: dq, page } }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="پیام‌های پشتیبانی" />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="موضوع، ایمیل یا شمارهٔ سفارش" />
        <MiniSelect label="وضعیت" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[["", "همه"], ["open", "باز"], ["in_progress", "در حال پیگیری"], ["closed", "بسته"]]} />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["موضوع", "فرستنده", "دسته", "سفارش", "زمان", "وضعیت"]} empty={!list.data.results.length}>
            {list.data.results.map((m) => (
              <tr key={m.id} className="cursor-pointer hover:bg-surface-alt/40" onClick={() => setOpenId(m.id)}>
                <td className="px-4 py-2">
                  <button type="button" className="text-start hover:underline" onClick={() => setOpenId(m.id)}>
                    {m.subject}
                  </button>
                </td>
                <td className="px-4 py-2">
                  {m.name} {m.is_customer ? <Badge>مشتری</Badge> : null}
                </td>
                <td className="px-4 py-2 text-xs">{m.topic_label}</td>
                <td className="ltr px-4 py-2 text-start text-xs">{m.order_number || "—"}</td>
                <td className="px-4 py-2 text-xs">{jalali(m.created_at, { time: true })}</td>
                <td className="px-4 py-2">
                  <Badge tone={m.status === "open" ? "warning" : m.status === "closed" ? "neutral" : "dark"}>{m.status_label}</Badge>
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={list.data.total_pages} onChange={setPage} />
        </>
      ) : null}
      {openId ? <MessageDialog id={openId} onClose={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["manage", "support"] }); }} /> : null}
    </div>
  );
}

function MessageDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["manage", "support-msg", id], queryFn: () => api<Detail>(`/manage/support/${id}`) });
  const [reply, setReply] = useState("");
  const set = (d: Detail) => qc.setQueryData(["manage", "support-msg", id], d);
  const send = useMutation({
    mutationFn: () => api<Detail>(`/manage/support/${id}`, { method: "POST", body: { body: reply } }),
    onSuccess: (d) => {
      set(d);
      setReply("");
      toast.success("پاسخ ارسال شد.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const patch = useMutation({ mutationFn: (body: Record<string, string>) => api<Detail>(`/manage/support/${id}`, { method: "PATCH", body }), onSuccess: set });
  const d = q.data;
  return (
    <Dialog open onClose={onClose} title={d?.subject ?? "پیام"} size="lg">
      {!d ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-4 p-5 text-sm">
          <p className="text-muted">
            {d.name} · <span className="ltr">{d.email}</span> · {d.topic_label} · {jalali(d.created_at, { time: true })}
          </p>
          <p className="whitespace-pre-line border border-line-soft bg-bg p-4">{d.body}</p>
          {d.replies.map((r, i) => (
            <div key={i} className="border-s-2 border-accent ps-4">
              <p className="text-xs text-muted">
                {r.author} · {jalali(r.created_at, { time: true })}
              </p>
              <p className="whitespace-pre-line">{r.body}</p>
            </div>
          ))}
          <SelectField label="وضعیت" value={d.status} onChange={(e) => patch.mutate({ status: e.target.value })}>
            <option value="open">باز</option>
            <option value="in_progress">در حال پیگیری</option>
            <option value="closed">بسته</option>
          </SelectField>
          <TextareaField label="یادداشت داخلی (فقط کارکنان)" defaultValue={d.staff_note} onBlur={(e) => e.target.value !== d.staff_note && patch.mutate({ staff_note: e.target.value })} maxLength={2000} />
          <TextareaField label="پاسخ به مشتری (ایمیل می‌شود)" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={3000} />
          <Button onClick={() => send.mutate()} loading={send.isPending} disabled={!reply.trim()} className="self-start">
            ارسال پاسخ
          </Button>
        </div>
      )}
    </Dialog>
  );
}
