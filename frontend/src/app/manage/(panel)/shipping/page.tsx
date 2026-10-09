"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Checkbox, TextField } from "@/components/ui/Field";
import { ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import { toAsciiDigits, toman } from "@/lib/format";
import { Card, PageHeader } from "@/manage/ui";

type Method = { id: number; code: string; name: string; description: string; eta_text: string; fee_toman: number; free_threshold_toman: number | null; is_active: boolean; version: number };
const num = (v: string) => Number(toAsciiDigits(v).replace(/[^\d]/g, ""));

function MethodForm({ m }: { m: Method }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(m);
  const save = useMutation({
    mutationFn: () => api<Method>(`/manage/shipping/${m.id}`, { method: "PATCH", body: form }),
    onSuccess: (r) => {
      setForm(r);
      qc.invalidateQueries({ queryKey: ["manage", "shipping"] });
      toast.success("روش ارسال ذخیره شد.");
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Card title={`${m.name} (${m.code})`}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label="نام" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} maxLength={60} />
        <TextField label="زمان تحویل" value={form.eta_text} onChange={(e) => setForm({ ...form, eta_text: e.target.value })} maxLength={60} />
        <TextField label="هزینه (تومان)" inputMode="numeric" value={form.fee_toman} onChange={(e) => setForm({ ...form, fee_toman: num(e.target.value) })} error={errors.fee_toman} hint={toman(form.fee_toman)} />
        <TextField
          label="حداقل خرید برای ارسال رایگان (پس از تخفیف؛ خالی = هرگز رایگان)"
          inputMode="numeric"
          value={form.free_threshold_toman ?? ""}
          onChange={(e) => setForm({ ...form, free_threshold_toman: e.target.value ? num(e.target.value) : null })}
          error={errors.free_threshold_toman}
          hint={form.free_threshold_toman !== null ? toman(form.free_threshold_toman) : "همیشه با هزینه"}
        />
        <div className="sm:col-span-2">
          <TextField label="توضیح" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} />
        </div>
        <Checkbox label="فعال" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
        {save.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
        <Button type="submit" size="sm" loading={save.isPending} className="sm:col-span-2 sm:justify-self-start">
          ذخیره
        </Button>
      </form>
    </Card>
  );
}

export default function ShippingPage() {
  const list = useQuery({ queryKey: ["manage", "shipping"], queryFn: () => api<Method[]>("/manage/shipping") });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="روش‌های ارسال" subtitle="نوار اطلاع‌رسانی بالای سایت و صفحهٔ ارسال از همین تنظیمات ساخته می‌شوند." />
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data?.map((m) => <MethodForm key={`${m.id}-${m.version}`} m={m} />)}
    </div>
  );
}
