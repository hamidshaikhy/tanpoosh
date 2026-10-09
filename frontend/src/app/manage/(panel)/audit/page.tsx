"use client";

import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { api, errorMessage } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { jalali } from "@/lib/format";
import { FilterBar, MiniSelect, PageHeader, Pager, SearchInput, Table } from "@/manage/ui";

type Row = { id: number; created_at: string; actor: string; action: string; object_type: string; object_id: string; object_label: string; result: string; ip_prefix: string; request_id: string; metadata: Record<string, unknown> };

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const [page, setPage] = useState(1);
  const da = useDeferredValue(action);
  const list = useQuery({ queryKey: ["manage", "audit", da, result, page], queryFn: () => api<Paginated<Row>>("/manage/audit", { query: { action: da, result, page } }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="گزارش رویدادها" subtitle="ثبت تغییرات حساس؛ این گزارش از پنل قابل ویرایش یا حذف نیست." />
      <FilterBar>
        <SearchInput value={action} onChange={(v) => { setAction(v); setPage(1); }} placeholder="مثلاً refund یا auth." />
        <MiniSelect label="نتیجه" value={result} onChange={(v) => { setResult(v); setPage(1); }} options={[["", "همه"], ["success", "موفق"], ["failed", "ناموفق"], ["denied", "رد شده"]]} />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["زمان", "کاربر", "رویداد", "موضوع", "نتیجه", "IP", "جزئیات"]} empty={!list.data.results.length}>
            {list.data.results.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-xs">{jalali(r.created_at, { time: true })}</td>
                <td className="ltr px-4 py-2 text-start">{r.actor}</td>
                <td className="ltr px-4 py-2 text-start text-xs">{r.action}</td>
                <td className="px-4 py-2 text-xs">{r.object_label || r.object_type}</td>
                <td className="px-4 py-2">
                  <Badge tone={r.result === "success" ? "success" : "danger"}>{r.result}</Badge>
                </td>
                <td className="ltr px-4 py-2 text-start text-xs">{r.ip_prefix}</td>
                <td className="ltr max-w-64 truncate px-4 py-2 text-start text-xs" title={JSON.stringify(r.metadata)}>
                  {JSON.stringify(r.metadata)}
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
