"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PasswordField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { auth } from "@/content/fa";
import { api, ApiError, errorMessage } from "@/lib/api/client";
import { useMe } from "@/lib/queries";

type Ctx = { withReauth: <T>(fn: () => Promise<T>) => Promise<T> };
const ReauthContext = createContext<Ctx | null>(null);

/**
 * Sensitive admin actions (refunds, staff/role changes, exports, review resolution) are
 * rejected by the API with `reauth_required` unless the session re-authenticated recently.
 * This provider prompts for password + TOTP, then retries the action once.
 */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);

  const prompt = () =>
    new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject };
      setPassword("");
      setCode("");
      setError(null);
      setOpen(true);
    });

  const withReauth = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.code === "reauth_required") {
        await prompt();
        return fn();
      }
      throw err;
    }
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/reauth", { method: "POST", body: { password, code } });
      setOpen(false);
      pending.current?.resolve();
      pending.current = null;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReauthContext.Provider value={{ withReauth }}>
      {children}
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          pending.current?.reject(new ApiError(403, { code: "reauth_cancelled", message: "عملیات لغو شد." }, ""));
          pending.current = null;
        }}
        title={auth.reauthTitle}
        size="sm"
      >
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="text-sm text-ink-soft">{auth.reauthBody}</p>
          <PasswordField label={auth.password} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {!me?.user?.mfa.dev_bypass ? (
            <TextField label={auth.mfaCode} ltr inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} />
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit" loading={busy} disabled={!password}>
            {auth.verify}
          </Button>
        </form>
      </Dialog>
    </ReauthContext.Provider>
  );
}

export function useReauth(): Ctx["withReauth"] {
  const ctx = useContext(ReauthContext);
  if (!ctx) throw new Error("useReauth outside ReauthProvider");
  return ctx.withReauth;
}
