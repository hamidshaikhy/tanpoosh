"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField, TextField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import { jalali } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { useReauth } from "@/manage/reauth";
import { PageHeader, Table } from "@/manage/ui";

type Staff = { id: string; username: string; email: string; name: string; role: string; role_label: string; is_active: boolean; mfa_enrolled: boolean; last_login: string | null; permissions: string[] };
const ROLES: [string, string][] = [
  ["owner", "مالک فروشگاه"],
  ["catalog_manager", "مدیر کاتالوگ"],
  ["order_manager", "مدیر سفارش‌ها"],
  ["finance", "امور مالی"],
];

export default function StaffPage() {
  const qc = useQueryClient();
  const withReauth = useReauth();
  const { data: me } = useMe();
  const list = useQuery({ queryKey: ["manage", "staff"], queryFn: () => api<Staff[]>("/manage/staff") });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", first_name: "", last_name: "", role: "order_manager" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["manage", "staff"] });
  const create = useMutation({
    mutationFn: () => withReauth(() => api<Staff>("/manage/staff", { method: "POST", body: form })),
    onSuccess: () => {
      toast.success("حساب ساخته شد و پیوند تعیین رمز به ایمیل ارسال شد.");
      setCreateOpen(false);
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => withReauth(() => api<Staff>(`/manage/staff/${id}`, { method: "PATCH", body })),
    onSuccess: () => {
      toast.success("ذخیره شد؛ نشست‌های آن کاربر برای اعمال دسترسی جدید خارج شدند.");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) => withReauth(() => api<Staff>(`/manage/staff/${id}?action=${act}`, { method: "POST" })),
    onSuccess: () => {
      toast.success("انجام شد.");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const errors = fieldErrors(create.error);
  return (
    <div>
      <PageHeader title="کارکنان و نقش‌ها" subtitle="ثبت‌نام عمومی کارکنان وجود ندارد. تغییر نقش و تأیید دومرحله‌ای نیازمند تأیید دوبارهٔ هویت است." actions={<Button onClick={() => setCreateOpen(true)}>افزودن کارمند</Button>} />
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      {list.data ? (
        <Table head={["کاربر", "نقش", "تأیید دومرحله‌ای", "آخرین ورود", "وضعیت", "عملیات"]}>
          {list.data.map((s) => {
            const self = s.id === me?.user?.id;
            return (
              <tr key={s.id}>
                <td className="px-4 py-2">
                  {s.name || s.username} {self ? <Badge>شما</Badge> : null}
                  <span className="ltr block text-start text-xs text-muted">
                    {s.username} · {s.email}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {self ? (
                    s.role_label
                  ) : (
                    <select className="h-9 border border-line bg-elevated px-2" value={s.role} onChange={(e) => update.mutate({ id: s.id, body: { role: e.target.value } })} aria-label={`نقش ${s.username}`}>
                      {[...ROLES, ["customer", "مشتری (لغو دسترسی)"]].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-2">{s.mfa_enrolled ? <Badge tone="success">فعال</Badge> : <Badge tone="warning">راه‌اندازی نشده</Badge>}</td>
                <td className="px-4 py-2 text-xs">{s.last_login ? jalali(s.last_login, { time: true }) : "—"}</td>
                <td className="px-4 py-2">{s.is_active ? <Badge tone="success">فعال</Badge> : <Badge tone="danger">غیرفعال</Badge>}</td>
                <td className="px-4 py-2">
                  {!self ? (
                    <span className="flex flex-wrap gap-3 text-xs">
                      <button type="button" className="underline" onClick={() => update.mutate({ id: s.id, body: { is_active: !s.is_active } })}>
                        {s.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                      </button>
                      {s.mfa_enrolled ? (
                        <button type="button" className="underline" onClick={() => confirm("تأیید دومرحله‌ای این کاربر بازنشانی شود؟") && action.mutate({ id: s.id, act: "reset-mfa" })}>
                          بازنشانی ۲FA
                        </button>
                      ) : null}
                      <button type="button" className="underline" onClick={() => action.mutate({ id: s.id, act: "revoke-sessions" })}>
                        خروج از همهٔ نشست‌ها
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </Table>
      ) : null}
      <Notice className="mt-6">آخرین مالک فعال فروشگاه قابل حذف یا تنزل نقش نیست. برای بازیابی دسترسی مالک از فرمان‌های مدیریتی سرور استفاده کنید (docs/RUNBOOK.md).</Notice>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="افزودن کارمند" size="md">
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField label="نام" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} error={errors.first_name} maxLength={60} />
          <TextField label="نام خانوادگی" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} maxLength={60} />
          <TextField label="نام کاربری" ltr value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} error={errors.username} maxLength={32} />
          <TextField label="ایمیل" ltr type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
          <SelectField label="نقش" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          {create.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(create.error)}</Notice> : null}
          <Button type="submit" loading={create.isPending} className="sm:col-span-2 sm:justify-self-start">
            ساخت حساب و ارسال دعوت‌نامه
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
