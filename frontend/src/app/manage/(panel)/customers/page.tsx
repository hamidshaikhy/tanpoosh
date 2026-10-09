"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { api, errorMessage } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { faDigits, jalali } from "@/lib/format";
import { FilterBar, PageHeader, Pager, SearchInput, Table } from "@/manage/ui";

type Row = { id: string; username: string; email: string; name: string; phone: string; is_active: boolean; email_verified: boolean; date_joined: string; orders_count: number; last_login: string | null };

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDeferredValue(q);
  const list = useQuery({ queryKey: ["manage", "customers", dq, page], queryFn: () => api<Paginated<Row>>("/manage/customers", { query: { q: dq, page } }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="مشتریان" subtitle="فقط اطلاعات لازم برای پشتیبانی؛ رمز عبور هیچ‌گاه قابل مشاهده یا بازیابی نیست." />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="نام، ایمیل، نام کاربری یا موبایل" />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["مشتری", "ایمیل", "سفارش پرداخت‌شده", "عضویت", "آخرین ورود", "وضعیت"]} empty={!list.data.results.length}>
            {list.data.results.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2">
                  <Link href={`/manage/customers/${c.id}`} className="hover:underline">
                    {c.name || c.username}
                  </Link>
                  <span className="ltr block text-start text-xs text-muted">{c.username}</span>
                </td>
                <td className="ltr px-4 py-2 text-start text-xs">
                  {c.email} {c.email_verified ? "✓" : ""}
                </td>
                <td className="num px-4 py-2">{faDigits(c.orders_count)}</td>
                <td className="px-4 py-2 text-xs">{jalali(c.date_joined)}</td>
                <td className="px-4 py-2 text-xs">{c.last_login ? jalali(c.last_login, { time: true }) : "—"}</td>
                <td className="px-4 py-2">{c.is_active ? <Badge tone="success">فعال</Badge> : <Badge tone="danger">غیرفعال</Badge>}</td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={list.data.total_pages} onChange={setPage} />
        </>
      ) : null}
    </div>
  );
}
