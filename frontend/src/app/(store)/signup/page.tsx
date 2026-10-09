"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { PasswordField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { auth } from "@/content/fa";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import type { AuthResult } from "@/lib/api/types";
import { safeNext } from "@/lib/normalize";
import { useApplyAuth } from "@/lib/queries";

const schema = z.object({
  first_name: z.string().trim().min(1, "نام را وارد کنید.").max(60),
  last_name: z.string().trim().min(1, "نام خانوادگی را وارد کنید.").max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._]{1,30}[a-z0-9]$/, "نام کاربری باید ۳ تا ۳۲ نویسه و فقط شامل حروف انگلیسی کوچک، عدد، نقطه یا زیرخط باشد."),
  email: z.email("ایمیل معتبر وارد کنید."),
  password: z.string().min(10, "رمز عبور باید حداقل ۱۰ نویسه باشد.").max(256, "رمز عبور حداکثر ۲۵۶ نویسه است."),
});
type Values = z.infer<typeof schema>;

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const apply = useApplyAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setServerError(null);
    try {
      const result = await api<AuthResult>("/auth/signup", { method: "POST", body: values });
      apply(result, { clearPrivate: true });
      toast.success("حساب شما ساخته شد. پیوند تأیید ایمیل برایتان ارسال شد.");
      router.replace(safeNext(params.get("next"), "/account"));
      router.refresh();
    } catch (err) {
      const fields = fieldErrors(err);
      let mapped = false;
      for (const [k, msg] of Object.entries(fields)) {
        if (k in schema.shape) {
          setError(k as keyof Values, { message: msg });
          mapped = true;
        }
      }
      if (!mapped) setServerError(errorMessage(err));
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <TextField label={auth.firstName} autoComplete="given-name" {...register("first_name")} error={errors.first_name?.message} required />
        <TextField label={auth.lastName} autoComplete="family-name" {...register("last_name")} error={errors.last_name?.message} required />
      </div>
      <TextField label={auth.username} ltr autoComplete="username" autoCapitalize="none" spellCheck={false} hint={auth.usernameHint} {...register("username")} error={errors.username?.message} required />
      <TextField label={auth.email} type="email" ltr autoComplete="email" {...register("email")} error={errors.email?.message} required />
      <PasswordField label={auth.password} autoComplete="new-password" hint={auth.passwordHint} {...register("password")} error={errors.password?.message} required />
      {serverError ? <Notice tone="danger">{serverError}</Notice> : null}
      <Button type="submit" size="lg" loading={isSubmitting} data-testid="signup-submit">
        {auth.submitSignup}
      </Button>
      <p className="text-xs leading-6 text-muted">
        با ساخت حساب،{" "}
        <Link href="/pages/terms" className="underline">
          قوانین
        </Link>{" "}
        و{" "}
        <Link href="/pages/privacy" className="underline">
          حریم خصوصی
        </Link>{" "}
        را می‌پذیرید.
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <AuthShell
      title={auth.signupTitle}
      subtitle={auth.signupSubtitle}
      footer={
        <>
          {auth.haveAccount}{" "}
          <Link href="/login" className="text-ink underline decoration-accent decoration-2 underline-offset-8">
            {auth.submitLogin}
          </Link>
        </>
      }
    >
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
