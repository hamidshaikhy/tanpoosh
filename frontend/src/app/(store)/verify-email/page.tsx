"use client";

import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { ButtonLink } from "@/components/ui/Button";
import { LoadingBlock, Notice } from "@/components/ui/States";
import { auth } from "@/content/fa";
import { api, errorMessage } from "@/lib/api/client";
import { clearFragment, readFragment } from "@/lib/fragment";
import { keys } from "@/lib/queries";

type State = { ok: boolean; message: string } | null;

function VerifyEmail() {
  const qc = useQueryClient();
  const [creds] = useState(() => {
    const p = readFragment();
    const uid = p.get("uid");
    const token = p.get("token");
    return uid && token ? { uid, token } : null;
  });
  const [result, setResult] = useState<State>(null);
  const verification = useRef<Promise<{ detail: string }> | null>(null);
  useEffect(() => {
    clearFragment();
    if (!creds) return;
    let active = true;
    // Strict Mode replays effects in development. A verification token is single-use:
    // reuse the in-flight request instead of consuming it twice.
    verification.current ??= api<{ detail: string }>("/auth/email/verify", { method: "POST", body: creds });
    verification.current
      .then((r) => {
        if (!active) return;
        setResult({ ok: true, message: r.detail });
        qc.invalidateQueries({ queryKey: keys.me });
      })
      .catch((e) => active && setResult({ ok: false, message: errorMessage(e) }));
    return () => {
      active = false;
    };
  }, [creds, qc]);
  const state: State = creds ? result : { ok: false, message: auth.invalidLink };
  return (
    <AuthShell title={auth.verifyTitle}>
      {!state ? <LoadingBlock label={auth.verifying} /> : <Notice tone={state.ok ? "success" : "danger"}>{state.message}</Notice>}
      {state?.ok ? (
        <ButtonLink href="/account" className="mt-6">
          {auth.goToAccount}
        </ButtonLink>
      ) : null}
    </AuthShell>
  );
}

const VerifyEmailClient = dynamic(() => Promise.resolve({ default: VerifyEmail }), { ssr: false });

export default function VerifyEmailPage() {
  return <VerifyEmailClient />;
}
