"use client";

import NextImage from "next/image";

import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { LoadingBlock, Notice } from "@/components/ui/States";
import { auth } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import type { AuthResult, Me } from "@/lib/api/types";
import { safeNext } from "@/lib/normalize";
import { useApplyAuth, useMe } from "@/lib/queries";

/** Staff entry: password login, then mandatory TOTP enrolment (first time) or verification. */
export function ManageLogin() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"), "/manage");
  const { data: me, isLoading } = useMe();
  const user = me?.authenticated ? me.user : null;

  useEffect(() => {
    if (user?.is_staff && user.mfa.verified) router.replace(next.startsWith("/manage") ? next : "/manage");
  }, [user, next, router]);

  if (isLoading) return <LoadingBlock className="min-h-dvh" />;
  if (!user) {
    return (
      <AuthShell title={auth.manageLoginTitle} subtitle={auth.manageLoginSubtitle}>
        <LoginForm staff onAuthenticated={() => undefined} />
      </AuthShell>
    );
  }
  if (!user.is_staff) {
    return (
      <AuthShell title={auth.manageLoginTitle}>
        <Notice tone="danger">حساب شما دسترسی به پنل مدیریت ندارد.</Notice>
      </AuthShell>
    );
  }
  if (user.mfa.verified) return <LoadingBlock className="min-h-dvh" />;
  return user.mfa.enrolled ? <MfaVerify /> : <MfaEnroll />;
}

function MfaVerify() {
  const apply = useApplyAuth();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const verify = useMutation({
    mutationFn: () => api<AuthResult>("/auth/mfa/verify", { method: "POST", body: mode === "totp" ? { code } : { recovery_code: code } }),
    onSuccess: (r) => apply(r),
  });
  return (
    <AuthShell title={auth.mfaTitle} subtitle={auth.mfaSubtitle}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate();
        }}
      >
        <TextField
          label={mode === "totp" ? auth.mfaCode : auth.recoveryCode}
          ltr
          inputMode={mode === "totp" ? "numeric" : "text"}
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={mode === "totp" ? 8 : 20}
          data-testid="mfa-code"
        />
        {verify.isError ? <Notice tone="danger">{errorMessage(verify.error)}</Notice> : null}
        <Button type="submit" size="lg" loading={verify.isPending} disabled={!code}>
          {auth.verify}
        </Button>
        <button type="button" className="self-start text-sm underline" onClick={() => setMode(mode === "totp" ? "recovery" : "totp")}>
          {mode === "totp" ? auth.useRecovery : auth.useTotp}
        </button>
      </form>
    </AuthShell>
  );
}

function MfaEnroll() {
  const apply = useApplyAuth();
  const [secret, setSecret] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const start = useMutation({
    mutationFn: () => api<{ secret: string; otpauth_uri: string }>("/auth/mfa/enroll", { method: "POST" }),
    onSuccess: async (r) => setSecret({ secret: r.secret, uri: r.otpauth_uri, qr: await QRCode.toDataURL(r.otpauth_uri, { margin: 1, width: 220, color: { dark: "#20221f", light: "#fbf8f2" } }) }),
  });
  const confirm = useMutation({
    mutationFn: () => api<{ recovery_codes: string[] }>("/auth/mfa/confirm", { method: "POST", body: { code } }),
    onSuccess: (r) => setCodes(r.recovery_codes),
  });
  const finish = useMutation({ mutationFn: () => api<Me>("/auth/me"), onSuccess: (m) => apply(m) });

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start.mutate();
  }, [start]);

  if (codes) {
    return (
      <AuthShell title={auth.recoveryTitle} subtitle={auth.recoveryBody}>
        <ul className="ltr grid grid-cols-2 gap-2 border border-line bg-bg p-4 font-mono text-sm" data-testid="recovery-codes">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>
            {auth.copy}
          </Button>
          <Button onClick={() => finish.mutate()} loading={finish.isPending}>
            {auth.recoverySaved}
          </Button>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={auth.enrollTitle} subtitle={auth.enrollSubtitle}>
      {start.isError ? <Notice tone="danger">{errorMessage(start.error)}</Notice> : null}
      {secret ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <p className="text-sm">{auth.enrollStep1}</p>
          <NextImage src={secret.qr} alt="کد QR برای افزودن حساب به برنامهٔ احراز هویت" width={220} height={220} className="self-center border border-line" />
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-soft">{auth.manualKey}</summary>
            <p className="ltr mt-2 break-all bg-bg p-2 font-mono text-xs" data-testid="mfa-secret">
              {secret.secret}
            </p>
          </details>
          <p className="text-sm">{auth.enrollStep2}</p>
          <TextField label={auth.mfaCode} ltr inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} data-testid="mfa-code" />
          {confirm.isError ? <Notice tone="danger">{errorMessage(confirm.error)}</Notice> : null}
          <Button type="submit" size="lg" loading={confirm.isPending} disabled={code.length < 6}>
            {auth.verify}
          </Button>
        </form>
      ) : (
        <LoadingBlock />
      )}
    </AuthShell>
  );
}
