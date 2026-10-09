"use client";

import NextImage from "next/image";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { ButtonLink } from "@/components/ui/Button";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { api, errorMessage } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { faDigits, jalali, toman } from "@/lib/format";
import { useCan } from "@/manage/ManageShell";
import type { ManageProductRow } from "@/manage/types";
import { FilterBar, MiniSelect, PageHeader, Pager, SearchInput, Table } from "@/manage/ui";

export default function ProductsPage() {
  const can = useCan();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDeferredValue(q);
  const list = useQuery({
    queryKey: ["manage", "products", status, dq, page],
    queryFn: () => api<Paginated<ManageProductRow>>("/manage/products", { query: { status, q: dq, page } }),
    placeholderData: (p) => p,
  });
  return (
    <div>
      <PageHeader title="محصولات" actions={can("catalog.edit") ? <ButtonLink href="/manage/products/new">محصول جدید</ButtonLink> : null} />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="نام، نامک یا SKU" />
        <MiniSelect label="وضعیت" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[["", "همه"], ["published", "منتشرشده"], ["draft", "پیش‌نویس"], ["archived", "بایگانی"]]} />
      </FilterBar>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : null}
      {list.data ? (
        <>
          <Table head={["", "محصول", "وضعیت", "دسته", "قیمت", "تنوع فعال", "موجودی قابل فروش", "عکس استودیو", "به‌روزرسانی"]} empty={!list.data.results.length}>
            {list.data.results.map((p) => (
              <tr key={p.id} className="hover:bg-surface-alt/40">
                <td className="px-4 py-2">{p.thumb ? <NextImage width={1600} height={2000} src={p.thumb} alt="" className="aspect-[4/5] w-10 bg-surface object-cover" /> : null}</td>
                <td className="px-4 py-2">
                  <Link href={`/manage/products/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <span className="ltr block text-start text-xs text-muted">{p.slug}</span>
                </td>
                <td className="px-4 py-2">
                  <Badge tone={p.status === "published" ? "success" : p.status === "archived" ? "neutral" : "warning"}>{p.status_label}</Badge>
                </td>
                <td className="px-4 py-2">{p.category}</td>
                <td className="num px-4 py-2">{toman(p.price_min)}</td>
                <td className="num px-4 py-2">{faDigits(p.variant_count)}</td>
                <td className="num px-4 py-2">{faDigits(p.available)}</td>
                <td className="px-4 py-2">{p.studio_supported ? <Badge tone="accent">دارد</Badge> : <span className="text-muted">—</span>}</td>
                <td className="px-4 py-2 text-xs text-muted">{jalali(p.updated_at)}</td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={list.data.total_pages} onChange={setPage} />
        </>
      ) : null}
    </div>
  );
}
