"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { faDigits, jalali } from "@/lib/format";
import { FilterBar, MiniSelect, PageHeader, Pager } from "@/manage/ui";

type Row = { id: number; product_name: string; product_slug: string; author: string; rating: number; title: string; body: string; status: string; status_label: string; verified_purchase: boolean; moderation_note: string; created_at: string };

export default function ReviewsModeration() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["manage", "reviews", status, page], queryFn: () => api<Paginated<Row>>("/manage/reviews", { query: { status, page } }), placeholderData: (p) => p });
  const moderate = useMutation({
    mutationFn: ({ id, status: s }: { id: number; status: string }) => api(`/manage/reviews/${id}/moderate`, { method: "POST", body: { status: s, note: "" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manage", "reviews"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageHeader title="نظرات" subtitle="فقط خریداران سفارش‌های تحویل‌شده می‌توانند نظر ثبت کنند؛ کارکنان نمی‌توانند نظر بسازند." />
      <FilterBar>
        <MiniSelect label="وضعیت" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[["pending", "در انتظار"], ["approved", "تأییدشده"], ["rejected", "ردشده"], ["", "همه"]]} />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      <ul className="flex flex-col gap-3">
        {list.data?.results.map((r) => (
          <li key={r.id} className="border border-line bg-elevated p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{r.product_name}</span>
              <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status_label}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">
              {r.author} · {faDigits(r.rating)} از ۵ · {jalali(r.created_at)} {r.verified_purchase ? "· خریدار تأییدشده" : ""}
            </p>
            {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
            <p className="mt-1 whitespace-pre-line text-ink-soft">{r.body}</p>
            <div className="mt-3 flex gap-4">
              {r.status !== "approved" ? (
                <button type="button" className="underline" onClick={() => moderate.mutate({ id: r.id, status: "approved" })}>
                  تأیید
                </button>
              ) : null}
              {r.status !== "rejected" ? (
                <button type="button" className="text-danger underline" onClick={() => moderate.mutate({ id: r.id, status: "rejected" })}>
                  رد
                </button>
              ) : null}
            </div>
          </li>
        ))}
        {list.data && !list.data.results.length ? <li className="py-8 text-center text-sm text-muted">نظری در این وضعیت نیست.</li> : null}
      </ul>
      {list.data ? <Pager page={page} total={list.data.total_pages} onChange={setPage} /> : null}
    </div>
  );
}
