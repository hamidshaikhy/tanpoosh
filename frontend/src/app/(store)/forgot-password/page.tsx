"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { auth } from "@/content/fa";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const send = useMutation({ mutationFn: () => api<{ detail: string }>("/auth/password/forgot", { method: "POST", body: { email } }) });
  const errors = fieldErrors(send.error);
  return (
    <AuthShell
      title={auth.forgotTitle}
      subtitle={auth.forgotSubtitle}
      footer={
        <Link href="/login" className="underline decoration-accent decoration-2 underline-offset-8">
          {auth.backToLogin}
        </Link>
      }
    >
      {send.isSuccess ? (
        <Notice tone="success">{send.data.detail}</Notice>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <TextField label={auth.email} type="email" ltr autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          {send.isError && !errors.email ? <Notice tone="danger">{errorMessage(send.error)}</Notice> : null}
          <Button type="submit" size="lg" loading={send.isPending} disabled={!email}>
            {auth.sendLink}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
