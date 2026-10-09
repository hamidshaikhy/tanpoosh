"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { PasswordField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { auth } from "@/content/fa";
import { api, ApiError, errorMessage } from "@/lib/api/client";
import type { AuthResult } from "@/lib/api/types";
import { safeNext } from "@/lib/normalize";
import { useApplyAuth } from "@/lib/queries";

const schema = z.object({
  identifier: z.string().trim().min(1, "ایمیل یا نام کاربری را وارد کنید.").max(254),
  password: z.string().min(1, "رمز عبور را وارد کنید.").max(1024),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ next, staff = false, onAuthenticated }: { next?: string | null; staff?: boolean; onAuthenticated?: (r: AuthResult) => void }) {
  const router = useRouter();
  const apply = useApplyAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setServerError(null);
    try {
      const result = await api<AuthResult>("/auth/login", { method: "POST", body: values });
      apply(result, { clearPrivate: true });
      for (const n of result.merge_notices ?? []) toast.info(n.message);
      if (onAuthenticated) {
        onAuthenticated(result);
        return;
      }
      router.replace(safeNext(next, "/account"));
      router.refresh();
    } catch (err) {
      setServerError(err instanceof ApiError && err.code === "rate_limited" ? "تعداد تلاش‌های ناموفق زیاد است. چند دقیقهٔ دیگر دوباره تلاش کنید یا رمز عبور را بازیابی کنید." : errorMessage(err));
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <TextField label={auth.identifier} ltr autoComplete="username" autoCapitalize="none" spellCheck={false} {...register("identifier")} error={errors.identifier?.message} required />
      <PasswordField label={auth.password} autoComplete="current-password" {...register("password")} error={errors.password?.message} required />
      {serverError ? <Notice tone="danger">{serverError}</Notice> : null}
      <Button type="submit" size="lg" loading={isSubmitting} data-testid={staff ? "manage-login-submit" : "login-submit"}>
        {auth.submitLogin}
      </Button>
      <Link href="/forgot-password" className="self-start text-sm text-ink-soft underline decoration-line underline-offset-8 hover:decoration-ink">
        {auth.forgot}
      </Link>
    </form>
  );
}
