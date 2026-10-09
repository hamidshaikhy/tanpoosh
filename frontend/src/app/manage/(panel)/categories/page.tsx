"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Checkbox, TextField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import { faDigits } from "@/lib/format";
import { useCan } from "@/manage/ManageShell";
import { Card, PageHeader } from "@/manage/ui";

type Row = { id: number; name: string; slug: string; description: string; sort_order: number; is_visible: boolean; product_count: number };

function Taxonomy({ kind, title }: { kind: "categories" | "collections"; title: string }) {
  const qc = useQueryClient();
  const can = useCan();
  const list = useQuery({ queryKey: ["manage", kind], queryFn: () => api<Row[]>(`/manage/${kind}`) });
  const [form, setForm] = useState({ name: "", slug: "", description: "", sort_order: 0, is_visible: true });
  const create = useMutation({
    mutationFn: () => api<Row>(`/manage/${kind}`, { method: "POST", body: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manage", kind] });
      qc.invalidateQueries({ queryKey: ["manage", "catalog-meta"] });
      setForm({ name: "", slug: "", description: "", sort_order: 0, is_visible: true });
      toast.success("ذخیره شد.");
    },
  });
  const update = useMutation({
    mutationFn: (r: Partial<Row> & { id: number }) => api<Row>(`/manage/${kind}/${r.id}`, { method: "PATCH", body: r }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manage", kind] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/manage/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manage", kind] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const errors = fieldErrors(create.error);
  return (
    <Card title={title}>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      <ul className="divide-y divide-line-soft text-sm">
        {list.data?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span>
              {r.name} <span className="ltr text-xs text-muted">/{r.slug}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-muted">{faDigits(r.product_count)} محصول</span>
              {r.is_visible ? <Badge tone="success">نمایان</Badge> : <Badge>پنهان</Badge>}
              {can("catalog.edit") ? (
                <>
                  <button type="button" className="underline" onClick={() => update.mutate({ id: r.id, is_visible: !r.is_visible })}>
                    {r.is_visible ? "پنهان کردن" : "نمایش"}
                  </button>
                  <button type="button" className="text-danger underline" onClick={() => confirm("حذف شود؟") && remove.mutate(r.id)}>
                    حذف
                  </button>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {can("catalog.edit") ? (
        <form
          className="mt-5 grid gap-3 border-t border-line-soft pt-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField label="نام" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} maxLength={80} />
          <TextField label="نامک (لاتین)" ltr value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} error={errors.slug} maxLength={80} />
          <div className="sm:col-span-2">
            <TextField label="توضیح" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} error={errors.description} maxLength={300} />
          </div>
          <Checkbox label="نمایان در فروشگاه" checked={form.is_visible} onChange={(e) => setForm({ ...form, is_visible: e.target.checked })} />
          <Button type="submit" size="sm" loading={create.isPending} className="justify-self-start">
            افزودن
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

export default function CategoriesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="دسته‌بندی و کالکشن" />
      <Taxonomy kind="categories" title="دسته‌بندی‌ها" />
      <Taxonomy kind="collections" title="کالکشن‌ها" />
    </div>
  );
}
