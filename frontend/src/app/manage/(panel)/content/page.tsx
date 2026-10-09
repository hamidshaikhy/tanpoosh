"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, SelectField, TextareaField, TextField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import type { InfoBlock, Paginated } from "@/lib/api/types";
import { jalali } from "@/lib/format";
import type { CatalogMeta, ManageProductRow } from "@/manage/types";
import { Card, PageHeader } from "@/manage/ui";

type Settings = Record<string, string | boolean | number | number[] | null> & { version: number; featured_products: number[]; featured_collection_id: number | null };
type PageRow = { slug: string; title: string; is_published: boolean; is_seed_content: boolean; updated_at: string; version: number };
type PageDetail = { slug: string; title: string; summary: string; blocks: InfoBlock[]; is_published: boolean; version: number };

const TEXT_FIELDS: [string, string, number][] = [
  ["hero_title", "عنوان بخش اصلی", 60],
  ["hero_subtitle", "زیرعنوان بخش اصلی", 120],
  ["hero_primary_label", "متن دکمهٔ اصلی", 30],
  ["hero_primary_href", "مسیر دکمهٔ اصلی (مثلاً /shop)", 200],
  ["hero_secondary_label", "متن پیوند دوم", 30],
  ["hero_secondary_href", "مسیر پیوند دوم", 200],
  ["picks_title", "عنوان انتخاب‌های روزمره", 60],
  ["picks_subtitle", "زیرعنوان انتخاب‌ها", 120],
  ["studio_title", "عنوان دعوت به استودیو", 60],
  ["studio_subtitle", "متن دعوت به استودیو", 160],
  ["announcement_text", "متن نوار اطلاع‌رسانی (خالی = خودکار از تنظیمات ارسال)", 120],
  ["footer_about", "متن پانویس", 300],
  ["contact_email", "ایمیل عمومی", 254],
  ["contact_phone", "تلفن عمومی", 20],
  ["contact_hours", "ساعات پاسخگویی", 120],
  ["contact_address", "نشانی عمومی", 300],
  ["instagram_url", "اینستاگرام (https://)", 200],
  ["telegram_url", "تلگرام (https://)", 200],
  ["seo_title", "عنوان سئوی سایت", 70],
  ["seo_description", "توضیح سئوی سایت", 160],
];
const LTR = new Set(["hero_primary_href", "hero_secondary_href", "contact_email", "contact_phone", "instagram_url", "telegram_url"]);
const MULTILINE = new Set(["footer_about", "studio_subtitle"]);
const BLOCK_LABEL = { heading: "عنوان", paragraph: "پاراگراف", list: "فهرست", note: "یادداشت" } as const;

export default function ContentPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["manage", "settings"], queryFn: () => api<Settings>("/manage/content/settings") });
  const meta = useQuery({ queryKey: ["manage", "catalog-meta"], queryFn: () => api<CatalogMeta>("/manage/catalog/meta") });
  const products = useQuery({
    queryKey: ["manage", "products", "published-all"],
    queryFn: () => api<Paginated<ManageProductRow>>("/manage/products", { query: { status: "published", page_size: 100 } }),
  });
  const pages = useQuery({ queryKey: ["manage", "pages"], queryFn: () => api<PageRow[]>("/manage/content/pages") });
  const [editing, setEditing] = useState<string | null>(null);

  if (settings.isLoading) return <LoadingBlock />;
  if (settings.isError || !settings.data) return <ErrorBlock message={errorMessage(settings.error)} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="محتوای سایت" subtitle="فقط فیلدهای ساختاریافته؛ HTML یا اسکریپت پذیرفته نمی‌شود." />
      <SettingsForm
        key={settings.data.version}
        initial={settings.data}
        collections={meta.data?.collections ?? []}
        products={products.data?.results ?? []}
        onSaved={(s) => qc.setQueryData(["manage", "settings"], s)}
      />
      <Card title="صفحات اطلاع‌رسانی">
        <ul className="divide-y divide-line-soft text-sm">
          {pages.data?.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span>
                {p.title} <span className="ltr text-xs text-muted">/pages/{p.slug}</span>
              </span>
              <span className="flex items-center gap-3">
                {p.is_seed_content ? <Badge tone="warning">محتوای نمونه</Badge> : null}
                {!p.is_published ? <Badge>منتشرنشده</Badge> : null}
                <span className="text-xs text-muted">{jalali(p.updated_at)}</span>
                <button type="button" className="underline" onClick={() => setEditing(p.slug)}>
                  ویرایش
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {editing ? (
        <PageEditor
          slug={editing}
          onClose={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["manage", "pages"] });
          }}
        />
      ) : null}
    </div>
  );
}

function SettingsForm({
  initial,
  collections,
  products,
  onSaved,
}: {
  initial: Settings;
  collections: CatalogMeta["collections"];
  products: ManageProductRow[];
  onSaved: (s: Settings) => void;
}) {
  const [form, setForm] = useState<Settings>(initial);
  const save = useMutation({
    mutationFn: () => api<Settings>("/manage/content/settings", { method: "PATCH", body: form }),
    onSuccess: (s) => {
      onSaved(s);
      toast.success("تنظیمات ذخیره شد و صفحات فروشگاه به‌روز می‌شوند.");
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Card title="صفحهٔ اصلی و اطلاعات عمومی">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {TEXT_FIELDS.map(([key, label, max]) =>
          MULTILINE.has(key) ? (
            <TextareaField key={key} label={label} value={String(form[key] ?? "")} onChange={(e) => setForm({ ...form, [key]: e.target.value })} error={errors[key]} maxLength={max} />
          ) : (
            <TextField key={key} label={label} ltr={LTR.has(key)} value={String(form[key] ?? "")} onChange={(e) => setForm({ ...form, [key]: e.target.value })} error={errors[key]} maxLength={max} />
          ),
        )}
        <Checkbox label="نمایش نوار اطلاع‌رسانی" checked={Boolean(form.announcement_enabled)} onChange={(e) => setForm({ ...form, announcement_enabled: e.target.checked })} />
        <SelectField label="کالکشن ویژه" value={form.featured_collection_id ?? ""} onChange={(e) => setForm({ ...form, featured_collection_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">بدون کالکشن ویژه</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm font-medium">محصولات «انتخاب‌های روزمره» (حداکثر ۸، به ترتیب انتخاب)</legend>
          {errors.featured_products ? <p className="mb-2 text-xs text-danger">{errors.featured_products}</p> : null}
          <div className="flex flex-wrap gap-3">
            {products.map((p) => {
              const idx = form.featured_products.indexOf(p.id);
              return (
                <label key={p.id} className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm ${idx >= 0 ? "border-ink" : "border-line"}`}>
                  <input
                    type="checkbox"
                    className="accent-ink"
                    checked={idx >= 0}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        featured_products: e.target.checked ? [...form.featured_products, p.id].slice(0, 8) : form.featured_products.filter((x) => x !== p.id),
                      })
                    }
                  />
                  {idx >= 0 ? <span className="num text-xs text-muted">{idx + 1}.</span> : null}
                  {p.name}
                </label>
              );
            })}
          </div>
        </fieldset>
        {save.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
        <Button type="submit" loading={save.isPending} className="md:col-span-2 md:justify-self-start">
          ذخیرهٔ تنظیمات
        </Button>
      </form>
    </Card>
  );
}

function PageEditor({ slug, onClose }: { slug: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["manage", "page", slug], queryFn: () => api<PageDetail>(`/manage/content/pages/${slug}`) });
  return (
    <Dialog open onClose={onClose} title={`ویرایش صفحه: ${slug}`} size="xl">
      {q.data ? <PageEditorForm key={q.data.version} slug={slug} initial={q.data} onClose={onClose} /> : <LoadingBlock />}
    </Dialog>
  );
}

function PageEditorForm({ slug, initial, onClose }: { slug: string; initial: PageDetail; onClose: () => void }) {
  const [form, setForm] = useState<PageDetail>(initial);
  const save = useMutation({
    mutationFn: () => api<PageDetail>(`/manage/content/pages/${slug}`, { method: "PATCH", body: form }),
    onSuccess: () => {
      toast.success("صفحه ذخیره شد.");
      onClose();
    },
  });
  const setBlock = (i: number, b: InfoBlock) => setForm({ ...form, blocks: form.blocks.map((x, j) => (j === i ? b : x)) });
  return (
    <form
      className="flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <TextField label="عنوان" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} />
      <TextField label="خلاصه" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={200} />
      <Checkbox label="منتشرشده" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
      <div className="flex flex-col gap-3">
        {form.blocks.map((b, i) => (
          <div key={i} className="flex flex-col gap-2 border border-line p-3">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{BLOCK_LABEL[b.type]}</span>
              <button type="button" className="text-danger underline" onClick={() => setForm({ ...form, blocks: form.blocks.filter((_, j) => j !== i) })}>
                حذف بخش
              </button>
            </div>
            {b.type === "list" ? (
              <TextareaField label="موارد (هر خط یک مورد)" value={b.items.join("\n")} onChange={(e) => setBlock(i, { type: "list", items: e.target.value.split("\n") })} />
            ) : (
              <TextareaField label="متن" value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["heading", "paragraph", "list", "note"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setForm({ ...form, blocks: [...form.blocks, t === "list" ? { type: "list", items: [""] } : { type: t, text: "" }] })}
          >
            + {BLOCK_LABEL[t]}
          </Button>
        ))}
      </div>
      {save.isError ? (
        <Notice tone="danger">
          {errorMessage(save.error)} {Object.values(fieldErrors(save.error)).join(" ")}
        </Notice>
      ) : null}
      <Button type="submit" loading={save.isPending} className="self-start">
        ذخیره
      </Button>
    </form>
  );
}
