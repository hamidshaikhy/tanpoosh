"use client";

import NextImage from "next/image";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, SelectField, TextareaField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, errorMessage, fieldErrors } from "@/lib/api/client";
import { faDigits, sizeLabel, toAsciiDigits, toman } from "@/lib/format";

import { useCan } from "./ManageShell";
import type { CatalogMeta, ManageColor, ManageProduct, ManageVariant } from "./types";
import { Card, PageHeader } from "./ui";

type Form = Omit<ManageProduct, "id" | "status" | "status_label" | "category" | "thumb" | "variant_count" | "price_min" | "price_max" | "on_hand" | "available" | "studio_supported" | "updated_at" | "published_at" | "publish_problems" | "media">;

const EMPTY: Form = {
  name: "",
  slug: "",
  category_id: 0,
  collection_ids: [],
  short_description: "",
  description: "",
  materials: "",
  care: "",
  fit_notes: "",
  size_chart: "tops",
  is_new: false,
  studio_slot: "none",
  studio_asset: "",
  seo_title: "",
  seo_description: "",
  sort_order: 0,
  version: 0,
  colors: [],
  variants: [],
};

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function ProductEditor({ productId }: { productId: number | null }) {
  const qc = useQueryClient();
  const router = useRouter();
  const can = useCan();
  const meta = useQuery({ queryKey: ["manage", "catalog-meta"], queryFn: () => api<CatalogMeta>("/manage/catalog/meta") });
  const product = useQuery({
    queryKey: ["manage", "product", productId],
    queryFn: () => api<ManageProduct>(`/manage/products/${productId}`),
    enabled: productId !== null,
  });
  const [form, setForm] = useState<Form>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const loadedVersion = useRef<number | null>(null);

  useEffect(() => {
    const p = product.data;
    if (p && loadedVersion.current !== p.version) {
      loadedVersion.current = p.version;
      setForm({
        name: p.name,
        slug: p.slug,
        category_id: p.category_id,
        collection_ids: p.collection_ids,
        short_description: p.short_description,
        description: p.description,
        materials: p.materials,
        care: p.care,
        fit_notes: p.fit_notes,
        size_chart: p.size_chart,
        is_new: p.is_new,
        studio_slot: p.studio_slot,
        studio_asset: p.studio_asset,
        seo_title: p.seo_title,
        seo_description: p.seo_description,
        sort_order: p.sort_order,
        version: p.version,
        colors: p.colors,
        variants: p.variants,
      });
      setDirty(false);
    }
  }, [product.data]);

  const patch = (p: Partial<Form>) => {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        category_id: form.category_id || meta.data?.categories[0]?.id || 0,
        variants: form.variants.map((v) => ({ ...v, price_toman: Number(v.price_toman), weight_grams: Number(v.weight_grams || 0), initial_stock: v.id ? undefined : Number(v.initial_stock || 0) })),
      };
      return productId === null
        ? api<ManageProduct>("/manage/products", { method: "POST", body })
        : api<ManageProduct>(`/manage/products/${productId}`, { method: "PATCH", body });
    },
    onSuccess: (p) => {
      toast.success("محصول ذخیره شد.");
      qc.setQueryData(["manage", "product", p.id], p);
      qc.invalidateQueries({ queryKey: ["manage", "products"] });
      loadedVersion.current = null;
      if (productId === null) router.replace(`/manage/products/${p.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "stale_version") toast.error(e.message);
      else toast.error(errorMessage(e));
    },
  });
  const status = useMutation({
    mutationFn: (action: string) => api<ManageProduct>(`/manage/products/${productId}/status`, { method: "POST", body: { action, version: form.version } }),
    onSuccess: (p) => {
      qc.setQueryData(["manage", "product", p.id], p);
      qc.invalidateQueries({ queryKey: ["manage", "products"] });
      loadedVersion.current = null;
      toast.success(`وضعیت: ${p.status_label}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/manage/products/${productId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("محصول حذف شد.");
      router.replace("/manage/products");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const errors = fieldErrors(save.error);
  const publishErrors = (save.error instanceof ApiError && save.error.fields.publish) || (status.error instanceof ApiError && status.error.fields.publish) || null;
  const garments = useMemo(() => (meta.data?.studio_garments ?? []).filter((g) => g.slot === form.studio_slot), [meta.data, form.studio_slot]);
  const canEdit = can("catalog.edit");

  if (meta.isLoading || (productId !== null && product.isLoading)) return <LoadingBlock />;
  if (meta.isError || product.isError) return <ErrorBlock message={errorMessage(meta.error || product.error)} />;
  const p = product.data;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        title={p ? p.name : "محصول جدید"}
        crumbs={[{ href: "/manage/products", label: "محصولات" }]}
        actions={
          p ? (
            <>
              <Badge tone={p.status === "published" ? "success" : p.status === "archived" ? "neutral" : "warning"}>{p.status_label}</Badge>
              {p.status === "published" ? (
                <Link href={`/products/${p.slug}`} target="_blank" className="text-sm underline">
                  مشاهده در فروشگاه
                </Link>
              ) : null}
              {can("catalog.publish") ? (
                p.status === "published" ? (
                  <Button size="sm" variant="secondary" onClick={() => status.mutate("unpublish")} loading={status.isPending} disabled={dirty}>
                    برگرداندن به پیش‌نویس
                  </Button>
                ) : p.status === "draft" ? (
                  <Button size="sm" variant="accent" onClick={() => status.mutate("publish")} loading={status.isPending} disabled={dirty} data-testid="publish">
                    انتشار
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => status.mutate("restore")} loading={status.isPending}>
                    بازگردانی از بایگانی
                  </Button>
                )
              ) : null}
              {can("catalog.publish") && p.status !== "archived" ? (
                <Button size="sm" variant="ghost" onClick={() => status.mutate("archive")} disabled={dirty}>
                  بایگانی
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {dirty && p ? <Notice tone="warning">تغییرات ذخیره‌نشده دارید. پیش از تغییر وضعیت انتشار، ذخیره کنید.</Notice> : null}
      {p?.publish_problems.length && p.status !== "published" ? (
        <Notice tone="warning">
          برای انتشار:
          <ul className="list-disc ps-5">
            {p.publish_problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {publishErrors ? (
        <Notice tone="danger">
          <ul className="list-disc ps-5">
            {publishErrors.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-6"
      >
        <fieldset disabled={!canEdit} className="flex flex-col gap-6">
          <Card title="اطلاعات اصلی">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="نام محصول" required value={form.name} onChange={(e) => patch({ name: e.target.value })} error={errors.name} maxLength={120} />
              <TextField
                label="نامک (slug) — حروف لاتین"
                required
                ltr
                value={form.slug}
                onChange={(e) => patch({ slug: slugify(e.target.value) })}
                error={errors.slug}
                hint="نشانی صفحهٔ محصول: /products/…"
                maxLength={120}
              />
              <SelectField label="دسته‌بندی" required value={form.category_id || meta.data!.categories[0]?.id || ""} onChange={(e) => patch({ category_id: Number(e.target.value) })} error={errors.category_id}>
                {meta.data!.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {!c.is_visible ? " (پنهان)" : ""}
                  </option>
                ))}
              </SelectField>
              <SelectField label="جدول سایز" value={form.size_chart} onChange={(e) => patch({ size_chart: e.target.value })}>
                {meta.data!.size_charts.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </SelectField>
              <fieldset className="md:col-span-2">
                <legend className="mb-2 text-sm font-medium text-ink-soft">کالکشن‌ها</legend>
                <div className="flex flex-wrap gap-4">
                  {meta.data!.collections.map((c) => (
                    <Checkbox
                      key={c.id}
                      label={c.name}
                      checked={form.collection_ids.includes(c.id)}
                      onChange={(e) => patch({ collection_ids: e.target.checked ? [...form.collection_ids, c.id] : form.collection_ids.filter((x) => x !== c.id) })}
                    />
                  ))}
                </div>
              </fieldset>
              <Checkbox label="نشان «جدید»" checked={form.is_new} onChange={(e) => patch({ is_new: e.target.checked })} />
              <TextField label="ترتیب نمایش" type="number" value={form.sort_order} onChange={(e) => patch({ sort_order: Number(e.target.value) })} />
            </div>
          </Card>

          <Card title="توضیحات (متن ساده؛ HTML پذیرفته نمی‌شود)">
            <div className="grid gap-4">
              <TextField label="خلاصه" value={form.short_description} onChange={(e) => patch({ short_description: e.target.value })} error={errors.short_description} maxLength={200} />
              <TextareaField label="توضیحات" value={form.description} onChange={(e) => patch({ description: e.target.value })} error={errors.description} maxLength={4000} />
              <div className="grid gap-4 md:grid-cols-3">
                <TextareaField label="جنس و ترکیب" value={form.materials} onChange={(e) => patch({ materials: e.target.value })} error={errors.materials} maxLength={1000} />
                <TextareaField label="نگهداری" value={form.care} onChange={(e) => patch({ care: e.target.value })} error={errors.care} maxLength={1000} />
                <TextareaField label="فیت و اندازه" value={form.fit_notes} onChange={(e) => patch({ fit_notes: e.target.value })} error={errors.fit_notes} maxLength={1000} />
              </div>
            </div>
          </Card>

          <ColorsAndVariants form={form} patch={patch} meta={meta.data!} errors={errors} />

          <Card title="استودیو تن‌پوش">
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label="بخش پرو" value={form.studio_slot} onChange={(e) => patch({ studio_slot: e.target.value, studio_asset: "" })}>
                {meta.data!.studio_slots.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="مجموعه عکس استودیو"
                value={form.studio_asset}
                onChange={(e) => patch({ studio_asset: e.target.value })}
                disabled={form.studio_slot === "none"}
                error={errors.studio_asset}
                hint="مجموعه عکس آماده باید مربوط به همین دستهٔ لباس باشد."
              >
                <option value="">بدون عکس استودیو</option>
                {garments.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label} ({g.id})
                  </option>
                ))}
              </SelectField>
            </div>
          </Card>

          <Card title="سئو">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="عنوان سئو" value={form.seo_title} onChange={(e) => patch({ seo_title: e.target.value })} error={errors.seo_title} maxLength={70} />
              <TextField label="توضیح سئو" value={form.seo_description} onChange={(e) => patch({ seo_description: e.target.value })} error={errors.seo_description} maxLength={160} />
            </div>
          </Card>
        </fieldset>

        {canEdit ? (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 py-3 lg:right-64">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <Button type="submit" loading={save.isPending} data-testid="save-product">
                ذخیرهٔ محصول
              </Button>
              {save.isError && Object.keys(errors).length ? <span className="text-sm text-danger">برخی فیلدها خطا دارند.</span> : null}
              {p && p.status === "draft" ? (
                <button type="button" className="ms-auto text-sm text-danger underline" onClick={() => confirm("محصول پیش‌نویس حذف شود؟") && remove.mutate()}>
                  حذف پیش‌نویس
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      {p ? <MediaManager product={p} colors={form.colors} meta={meta.data!} /> : <Notice>پس از اولین ذخیره می‌توانید تصویر بارگذاری کنید.</Notice>}
    </div>
  );
}

function ColorsAndVariants({ form, patch, meta, errors }: { form: Form; patch: (p: Partial<Form>) => void; meta: CatalogMeta; errors: Record<string, string> }) {
  const [genSizes, setGenSizes] = useState("");
  const [genPrice, setGenPrice] = useState("");
  const [genStock, setGenStock] = useState("0");
  const prefix = form.slug ? form.slug.split("-").map((w) => w.slice(0, 3)).join("").toUpperCase().slice(0, 6) : "TP";

  const setColor = (i: number, c: Partial<ManageColor>) => {
    const old = form.colors[i];
    const colors = form.colors.map((x, j) => (j === i ? { ...x, ...c } : x));
    const variants = c.code && old ? form.variants.map((v) => (v.color_code === old.code ? { ...v, color_code: c.code! } : v)) : form.variants;
    patch({ colors, variants });
  };
  const generate = () => {
    const sizes = toAsciiDigits(genSizes || (meta.size_presets[form.size_chart] ?? []).join(","))
      .split(/[,،\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const price = Number(toAsciiDigits(genPrice).replace(/[^\d]/g, ""));
    if (!price || !form.colors.length || !sizes.length) {
      toast.error("رنگ، سایزها و قیمت را مشخص کنید.");
      return;
    }
    const existing = new Set(form.variants.map((v) => `${v.color_code}:${v.size}`));
    const added: ManageVariant[] = [];
    for (const c of form.colors) {
      for (const s of sizes) {
        if (existing.has(`${c.code}:${s}`)) continue;
        added.push({ color_code: c.code, size: s, sku: `TP-${prefix}-${c.code.slice(0, 3).toUpperCase()}-${s}`, price_toman: price, is_active: true, weight_grams: 0, initial_stock: Number(toAsciiDigits(genStock)) || 0 });
      }
    }
    patch({ variants: [...form.variants, ...added] });
  };
  return (
    <Card title="رنگ‌ها و تنوع‌ها (رنگ × سایز)">
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="mb-2 text-sm font-medium">رنگ‌ها</h3>
          <div className="flex flex-col gap-2">
            {form.colors.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_120px_auto] items-end gap-2">
                <TextField label="نام رنگ" value={c.name} onChange={(e) => setColor(i, { name: e.target.value })} error={errors[`colors.${i}.name`]} maxLength={40} />
                <TextField label="کد (لاتین)" ltr value={c.code} onChange={(e) => setColor(i, { code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} error={errors[`colors.${i}.code`]} maxLength={32} />
                <label className="flex flex-col gap-1.5 text-sm text-ink-soft">
                  رنگ
                  <input type="color" value={c.hex} onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })} className="h-12 w-full border border-line bg-elevated p-1" />
                </label>
                <button
                  type="button"
                  className="mb-3 text-sm text-danger underline"
                  onClick={() => patch({ colors: form.colors.filter((_, j) => j !== i), variants: form.variants.filter((v) => v.color_code !== c.code || v.id) })}
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => patch({ colors: [...form.colors, { code: `color-${form.colors.length + 1}`, name: "", hex: "#20221F", sort_order: form.colors.length }] })}>
            افزودن رنگ
          </Button>
        </div>

        <div className="border-t border-line-soft pt-5">
          <h3 className="mb-2 text-sm font-medium">ساخت سریع تنوع‌ها</h3>
          <div className="flex flex-wrap items-end gap-3">
            <TextField label="سایزها (با کاما)" ltr placeholder={(meta.size_presets[form.size_chart] ?? []).join(",")} value={genSizes} onChange={(e) => setGenSizes(e.target.value)} />
            <TextField label="قیمت (تومان)" inputMode="numeric" value={genPrice} onChange={(e) => setGenPrice(e.target.value)} />
            <TextField label="موجودی اولیه" inputMode="numeric" value={genStock} onChange={(e) => setGenStock(e.target.value)} />
            <Button type="button" size="sm" variant="secondary" onClick={generate}>
              ساخت تنوع‌های جدید
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-ink-soft">
                <th className="py-2 text-start font-medium">رنگ</th>
                <th className="py-2 text-start font-medium">سایز</th>
                <th className="py-2 text-start font-medium">SKU</th>
                <th className="py-2 text-start font-medium">قیمت (تومان)</th>
                <th className="py-2 text-start font-medium">موجودی</th>
                <th className="py-2 text-start font-medium">فعال</th>
              </tr>
            </thead>
            <tbody>
              {form.variants.map((v, i) => {
                const set = (x: Partial<ManageVariant>) => patch({ variants: form.variants.map((y, j) => (j === i ? { ...y, ...x } : y)) });
                return (
                  <tr key={`${v.color_code}-${v.size}-${i}`} className={`border-b border-line-soft ${v.is_active ? "" : "opacity-50"}`}>
                    <td className="py-1.5">{form.colors.find((c) => c.code === v.color_code)?.name || v.color_code}</td>
                    <td className="ltr py-1.5 text-start">{sizeLabel(v.size)}</td>
                    <td className="py-1.5">
                      <input aria-label="SKU" className="ltr h-9 w-44 border border-line bg-elevated px-2" value={v.sku} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} />
                      {errors[`variants.${i}.sku`] ? <span className="block text-xs text-danger">{errors[`variants.${i}.sku`]}</span> : null}
                    </td>
                    <td className="py-1.5">
                      <input aria-label="قیمت" inputMode="numeric" className="num h-9 w-32 border border-line bg-elevated px-2" value={v.price_toman} onChange={(e) => set({ price_toman: Number(toAsciiDigits(e.target.value).replace(/[^\d]/g, "")) })} />
                      <span className="block text-[11px] text-muted">{toman(Number(v.price_toman))}</span>
                    </td>
                    <td className="py-1.5">
                      {v.id ? (
                        <span className="num text-muted">
                          {faDigits(v.on_hand ?? 0)} (رزرو {faDigits(v.reserved ?? 0)})
                        </span>
                      ) : (
                        <input aria-label="موجودی اولیه" inputMode="numeric" className="num h-9 w-20 border border-line bg-elevated px-2" value={v.initial_stock ?? 0} onChange={(e) => set({ initial_stock: Number(toAsciiDigits(e.target.value).replace(/[^\d]/g, "")) || 0 })} />
                      )}
                    </td>
                    <td className="py-1.5">
                      <input type="checkbox" className="size-4 accent-ink" checked={v.is_active} onChange={(e) => set({ is_active: e.target.checked })} aria-label="فعال" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!form.variants.length ? <p className="py-6 text-center text-sm text-muted">هنوز تنوعی ساخته نشده است.</p> : null}
          <p className="mt-2 text-xs text-muted">تغییر موجودی تنوع‌های موجود از صفحهٔ «موجودی انبار» و با ثبت دلیل انجام می‌شود. تنوع‌های دارای سابقه حذف نمی‌شوند و فقط غیرفعال می‌شوند.</p>
        </div>
      </div>
    </Card>
  );
}

function MediaManager({ product, colors, meta }: { product: ManageProduct; colors: ManageColor[]; meta: CatalogMeta }) {
  const qc = useQueryClient();
  const can = useCan();
  const fileRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState("");
  const [kind, setKind] = useState("front");
  const [alt, setAlt] = useState("");
  const [editing, setEditing] = useState<{ id: number; alt: string; kind: string; color: string } | null>(null);
  const refresh = (p: ManageProduct) => qc.setQueryData(["manage", "product", p.id], p);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("color_code", color);
      form.append("kind", kind);
      form.append("alt_text", alt || product.name);
      return api<ManageProduct>(`/manage/products/${product.id}/media`, { method: "POST", form });
    },
    onSuccess: (p) => {
      refresh(p);
      setAlt("");
      toast.success("تصویر بارگذاری شد.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: number) => api<ManageProduct>(`/manage/products/${product.id}/media/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const edit = useMutation({
    mutationFn: (e: { id: number; alt: string; kind: string; color: string }) =>
      api<ManageProduct>(`/manage/products/${product.id}/media/${e.id}`, { method: "PATCH", body: { alt_text: e.alt, kind: e.kind, color_code: e.color } }),
    onSuccess: (p) => {
      refresh(p);
      setEditing(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reorder = useMutation({
    mutationFn: (ids: number[]) => api<ManageProduct>(`/manage/products/${product.id}/media/reorder`, { method: "POST", body: { ids } }),
    onSuccess: refresh,
  });
  const move = (index: number, dir: -1 | 1) => {
    const ids = product.media.map((m) => m.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <Card title={`تصاویر (${faDigits(product.media.length)})`}>
      {can("media.upload") ? (
        <div className="mb-5 flex flex-wrap items-end gap-3 border-b border-line-soft pb-5">
          <SelectField label="رنگ" value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">همهٔ رنگ‌ها</option>
            {colors.filter((c) => c.id).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="نوع" value={kind} onChange={(e) => setKind(e.target.value)}>
            {meta.media_kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </SelectField>
          <TextField label="متن جایگزین (alt)" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={160} />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id="media-upload"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="secondary" loading={upload.isPending} onClick={() => fileRef.current?.click()} icon={<Icon name="upload" />}>
            بارگذاری تصویر
          </Button>
          <p className="w-full text-xs text-muted">JPEG، PNG یا WebP؛ حداکثر ۸ مگابایت؛ حداقل ۳۰۰ پیکسل. تصویر روی سرور بررسی، بازکدگذاری و فراداده‌اش حذف می‌شود.</p>
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {product.media.map((m, i) => (
          <li key={m.id} className="flex flex-col gap-2 border border-line p-2 text-xs">
            <NextImage width={1600} height={2000} src={m.thumb} alt={m.alt} className="aspect-[4/5] w-full bg-surface object-cover" />
            <p className="line-clamp-2">{m.alt}</p>
            <p className="text-muted">
              {meta.media_kinds.find((k) => k.value === m.kind)?.label} · {colors.find((c) => c.code === m.color_code)?.name ?? "همهٔ رنگ‌ها"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="underline disabled:opacity-30" aria-label="جابه‌جایی به قبل">
                قبل
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === product.media.length - 1} className="underline disabled:opacity-30" aria-label="جابه‌جایی به بعد">
                بعد
              </button>
              <button type="button" className="underline" onClick={() => setEditing({ id: m.id, alt: m.alt, kind: m.kind, color: m.color_code ?? "" })}>
                ویرایش
              </button>
              <button type="button" className="text-danger underline" onClick={() => confirm("تصویر حذف شود؟") && del.mutate(m.id)}>
                حذف
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title="ویرایش تصویر" size="sm">
        {editing ? (
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              edit.mutate(editing);
            }}
          >
            <TextField label="متن جایگزین (alt)" required value={editing.alt} onChange={(e) => setEditing({ ...editing, alt: e.target.value })} maxLength={160} />
            <SelectField label="نوع" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
              {meta.media_kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="رنگ" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })}>
              <option value="">همهٔ رنگ‌ها</option>
              {colors.filter((c) => c.id).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <Button type="submit" loading={edit.isPending}>
              ذخیره
            </Button>
          </form>
        ) : null}
      </Dialog>
    </Card>
  );
}
