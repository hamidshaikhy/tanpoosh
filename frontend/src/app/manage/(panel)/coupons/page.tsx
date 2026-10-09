"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { faDigits, jalali, toAsciiDigits, toman } from "@/lib/format";
import { PageHeader, Pager, Table } from "@/manage/ui";

type Coupon = {
  id: number;
  code: string;
  description: string;
  kind: "percent" | "fixed";
  value: number;
  max_discount_toman: number | null;
  min_subtotal_toman: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_customer_limit: number;
  product_ids: number[];
  category_ids: number[];
  is_active: boolean;
  used: number;
  reserved: number;
  version: number;
};

const EMPTY = { id: 0, code: "", description: "", kind: "percent" as const, value: 10, max_discount_toman: null, min_subtotal_toman: 0, starts_at: null, ends_at: null, usage_limit: null, per_customer_limit: 1, product_ids: [], category_ids: [], is_active: true, used: 0, reserved: 0, version: 0 };
const num = (v: string) => Number(toAsciiDigits(v).replace(/[^\d]/g, ""));
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export default function CouponsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Coupon | null>(null);
  const list = useQuery({ queryKey: ["manage", "coupons", page], queryFn: () => api<Paginated<Coupon>>("/manage/coupons", { query: { page } }) });
  const save = useMutation({
    mutationFn: (c: Coupon) => {
      const body = { ...c, starts_at: c.starts_at || null, ends_at: c.ends_at || null };
      return c.id ? api<Coupon>(`/manage/coupons/${c.id}`, { method: "PATCH", body }) : api<Coupon>("/manage/coupons", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success("کد تخفیف ذخیره شد.");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["manage", "coupons"] });
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <div>
      <PageHeader title="کدهای تخفیف" subtitle="هر سفارش فقط یک کد می‌پذیرد؛ ظرفیت با قفل پایگاه‌داده کنترل می‌شود." actions={<Button onClick={() => setEdit({ ...EMPTY })}>کد جدید</Button>} />
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <>
          <Table head={["کد", "نوع", "مقدار", "حداقل خرید", "بازه", "استفاده / ظرفیت", "وضعیت", ""]} empty={!list.data.results.length}>
            {list.data.results.map((c) => (
              <tr key={c.id}>
                <td className="ltr px-4 py-2 text-start font-medium">{c.code}</td>
                <td className="px-4 py-2">{c.kind === "percent" ? "درصدی" : "مبلغ ثابت"}</td>
                <td className="num px-4 py-2">{c.kind === "percent" ? `${faDigits(c.value)}٪` : toman(c.value)}</td>
                <td className="num px-4 py-2">{toman(c.min_subtotal_toman)}</td>
                <td className="px-4 py-2 text-xs">
                  {c.starts_at ? jalali(c.starts_at) : "—"} تا {c.ends_at ? jalali(c.ends_at) : "—"}
                </td>
                <td className="num px-4 py-2">
                  {faDigits(c.used)} (+{faDigits(c.reserved)} رزرو) / {c.usage_limit ? faDigits(c.usage_limit) : "∞"}
                </td>
                <td className="px-4 py-2">{c.is_active ? <Badge tone="success">فعال</Badge> : <Badge>غیرفعال</Badge>}</td>
                <td className="px-4 py-2">
                  <button type="button" className="underline" onClick={() => setEdit(c)}>
                    ویرایش
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={list.data.total_pages} onChange={setPage} />
        </>
      ) : null}
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? `ویرایش ${edit.code}` : "کد تخفیف جدید"} size="lg">
        {edit ? (
          <form
            className="grid gap-4 p-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(edit);
            }}
          >
            <TextField label="کد (حروف لاتین بزرگ)" ltr required value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} error={errors.code} maxLength={32} />
            <TextField label="توضیح" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={200} />
            <SelectField label="نوع" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Coupon["kind"] })}>
              <option value="percent">درصدی</option>
              <option value="fixed">مبلغ ثابت (تومان)</option>
            </SelectField>
            <TextField label={edit.kind === "percent" ? "درصد (۱ تا ۹۰)" : "مبلغ (تومان)"} inputMode="numeric" value={edit.value} onChange={(e) => setEdit({ ...edit, value: num(e.target.value) })} error={errors.value} />
            <TextField label="سقف تخفیف (تومان، اختیاری)" inputMode="numeric" value={edit.max_discount_toman ?? ""} onChange={(e) => setEdit({ ...edit, max_discount_toman: e.target.value ? num(e.target.value) : null })} error={errors.max_discount_toman} />
            <TextField label="حداقل مبلغ خرید (تومان)" inputMode="numeric" value={edit.min_subtotal_toman} onChange={(e) => setEdit({ ...edit, min_subtotal_toman: num(e.target.value) })} />
            <TextField label="شروع (اختیاری)" type="datetime-local" ltr value={toLocalInput(edit.starts_at)} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            <TextField label="پایان (اختیاری)" type="datetime-local" ltr value={toLocalInput(edit.ends_at)} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} error={errors.ends_at} />
            <TextField label="ظرفیت کل (اختیاری)" inputMode="numeric" value={edit.usage_limit ?? ""} onChange={(e) => setEdit({ ...edit, usage_limit: e.target.value ? num(e.target.value) : null })} />
            <TextField label="سقف هر مشتری" inputMode="numeric" value={edit.per_customer_limit} onChange={(e) => setEdit({ ...edit, per_customer_limit: num(e.target.value) || 1 })} />
            <Checkbox label="فعال" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
            {save.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
            <Button type="submit" loading={save.isPending} className="sm:col-span-2 sm:justify-self-start">
              ذخیره
            </Button>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
