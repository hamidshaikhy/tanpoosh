"use client";

import { useMutation } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { auth } from "@/content/fa";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import { clearFragment, readFragment } from "@/lib/fragment";

/** The uid/token arrive in the URL fragment (not sent to servers or referrers) and are removed
 *  from the address bar as soon as they are read. */
function ResetPasswordForm() {
  const [creds] = useState<{ uid: string; token: string } | null>(() => {
    const p = readFragment();
    const uid = p.get("uid");
    const token = p.get("token");
    return uid && token ? { uid, token } : null;
  });
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [mismatch, setMismatch] = useState(false);
  useEffect(clearFragment, []);
  const reset = useMutation({
    mutationFn: () => api<{ detail: string }>("/auth/password/reset", { method: "POST", body: { ...creds, new_password: password } }),
  });
  const errors = fieldErrors(reset.error);
  return (
    <AuthShell
      title={auth.resetTitle}
      footer={
        <Link href="/login" className="underline decoration-accent decoration-2 underline-offset-8">
          {auth.backToLogin}
        </Link>
      }
    >
      {creds === null ? <Notice tone="danger">{auth.invalidLink}</Notice> : null}
      {reset.isSuccess ? <Notice tone="success">{reset.data.detail}</Notice> : null}
      {creds && !reset.isSuccess ? (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (password !== repeat) {
              setMismatch(true);
              return;
            }
            setMismatch(false);
            reset.mutate();
          }}
        >
          <PasswordField label={auth.newPassword} autoComplete="new-password" hint={auth.passwordHint} required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.new_password} />
          <PasswordField label={auth.repeatPassword} autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} error={mismatch ? auth.passwordsMismatch : undefined} />
          {reset.isError && !errors.new_password ? <Notice tone="danger">{errorMessage(reset.error)}</Notice> : null}
          <Button type="submit" size="lg" loading={reset.isPending} disabled={!password}>
            {auth.submitReset}
          </Button>
        </form>
      ) : null}
    </AuthShell>
  );
}

// Client-only: the fragment exists only in the browser.
const ResetPasswordClient = dynamic(() => Promise.resolve({ default: ResetPasswordForm }), { ssr: false });

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
