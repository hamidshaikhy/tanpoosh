"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/States";
import { auth } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import { faDigits } from "@/lib/format";
import { useReauth } from "@/manage/reauth";
import { Card, PageHeader } from "@/manage/ui";

export default function StaffSecurityPage() {
  const withReauth = useReauth();
  const status = useQuery({ queryKey: ["manage", "recovery"], queryFn: () => api<{ remaining: number }>("/auth/mfa/recovery-codes") });
  const [codes, setCodes] = useState<string[] | null>(null);
  const regen = useMutation({
    mutationFn: () => withReauth(() => api<{ recovery_codes: string[] }>("/auth/mfa/recovery-codes", { method: "POST" })),
    onSuccess: (r) => {
      setCodes(r.recovery_codes);
      status.refetch();
    },
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="امنیت حساب من" />
      <Card title="کدهای بازیابی تأیید دومرحله‌ای">
        <p className="text-sm text-ink-soft">کدهای استفاده‌نشده: {faDigits(status.data?.remaining ?? 0)}</p>
        {codes ? (
          <>
            <Notice tone="warning" className="mt-4">
              {auth.recoveryBody}
            </Notice>
            <ul className="ltr mt-3 grid grid-cols-2 gap-2 border border-line bg-bg p-4 font-mono text-sm">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        ) : null}
        {regen.isError ? <Notice tone="danger" className="mt-3">{errorMessage(regen.error)}</Notice> : null}
        <Button className="mt-4" variant="secondary" onClick={() => regen.mutate()} loading={regen.isPending}>
          ساخت کدهای جدید (کدهای قبلی باطل می‌شوند)
        </Button>
      </Card>
      <Card title="رمز عبور و نشست‌ها">
        <p className="text-sm text-ink-soft">
          تغییر رمز عبور و مدیریت نشست‌های فعال از{" "}
          <a href="/account/security" className="underline">
            صفحهٔ امنیت حساب
          </a>{" "}
          انجام می‌شود. نشست‌های کارکنان پس از ۴ ساعت عدم فعالیت خاتمه می‌یابند.
        </p>
      </Card>
    </div>
  );
}
