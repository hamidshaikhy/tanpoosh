"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PageTitle } from "@/components/account/AccountShell";
import { Button } from "@/components/ui/Button";
import { PasswordField, TextField } from "@/components/ui/Field";
import { Badge, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { account as copy, auth } from "@/content/fa";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import type { Me, SessionRow } from "@/lib/api/types";
import { jalali } from "@/lib/format";
import { keys, useApplyAuth, useMe } from "@/lib/queries";

export default function SecurityPage() {
  const { data: me } = useMe();
  const user = me?.user;
  if (!user) return null;
  return (
    <div className="flex flex-col gap-10">
      <PageTitle>{copy.security}</PageTitle>
      <ProfileForm key={`${user.id}:${user.first_name}:${user.last_name}:${user.phone}`} initial={{ first_name: user.first_name, last_name: user.last_name, phone: user.phone }} />
      <ChangePassword />
      <ChangeEmail current={user.email} pending={user.pending_email} />
      <Sessions />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-elevated p-5 sm:p-6">
      <h2 className="mb-5 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ProfileForm({ initial }: { initial: { first_name: string; last_name: string; phone: string } }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial);
  const save = useMutation({
    mutationFn: () => api<Me>("/account/profile", { method: "PATCH", body: form }),
    onSuccess: (data) => {
      qc.setQueryData(keys.me, data);
      toast.success(copy.saved);
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Section title={copy.profile}>
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label={auth.firstName} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} error={errors.first_name} maxLength={60} />
        <TextField label={auth.lastName} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} error={errors.last_name} maxLength={60} />
        <TextField label="موبایل" type="tel" ltr value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} maxLength={20} />
        <Button type="submit" loading={save.isPending} className="self-start sm:col-span-3">
          {copy.save}
        </Button>
      </form>
    </Section>
  );
}

function ChangePassword() {
  const apply = useApplyAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => api<Me & { csrf_token: string }>("/auth/password/change", { method: "POST", body: { current_password: current, new_password: next } }),
    onSuccess: (r) => {
      apply(r);
      setCurrent("");
      setNext("");
      toast.success("رمز عبور تغییر کرد و دستگاه‌های دیگر خارج شدند.");
    },
  });
  const errors = fieldErrors(change.error);
  return (
    <Section title={copy.changePassword}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <PasswordField label={copy.currentPassword} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current_password} />
        <PasswordField label={auth.newPassword} autoComplete="new-password" hint={auth.passwordHint} value={next} onChange={(e) => setNext(e.target.value)} error={errors.new_password} />
        {change.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(change.error)}</Notice> : null}
        <Button type="submit" loading={change.isPending} disabled={!current || !next} className="self-start sm:col-span-2">
          {copy.changePassword}
        </Button>
      </form>
    </Section>
  );
}

function ChangeEmail({ current, pending }: { current: string; pending: string }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const change = useMutation({
    mutationFn: () => api<{ detail: string }>("/auth/email/change", { method: "POST", body: { password, new_email: email } }),
    onSuccess: (r) => {
      toast.success(r.detail);
      setPassword("");
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
  const errors = fieldErrors(change.error);
  return (
    <Section title={copy.changeEmail}>
      <p className="mb-4 text-sm text-ink-soft">
        ایمیل فعلی: <bdi className="ltr">{current}</bdi>
      </p>
      {pending ? <Notice className="mb-4">{copy.pendingEmail(pending)}</Notice> : null}
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <TextField label={copy.newEmail} type="email" ltr value={email} onChange={(e) => setEmail(e.target.value)} error={errors.new_email} />
        <PasswordField label={auth.password} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <Button type="submit" loading={change.isPending} disabled={!email || !password} className="self-start sm:col-span-2">
          {copy.changeEmail}
        </Button>
      </form>
    </Section>
  );
}

function Sessions() {
  const list = useQuery({ queryKey: ["sessions"], queryFn: () => api<SessionRow[]>("/auth/sessions") });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: "DELETE" }), onSuccess: () => list.refetch() });
  const revokeOthers = useMutation({
    mutationFn: () => api<{ revoked: number }>("/auth/sessions/revoke-others", { method: "POST" }),
    onSuccess: () => {
      list.refetch();
      toast.success("از دستگاه‌های دیگر خارج شدید.");
    },
  });
  return (
    <Section title={copy.sessions}>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} /> : null}
      <ul className="divide-y divide-line-soft text-sm">
        {list.data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="ltr text-start text-xs text-ink-soft">{s.user_agent || "—"}</p>
              <p className="text-xs text-muted">
                {copy.lastSeen}: {jalali(s.last_seen_at || s.created_at, { time: true })} · <span className="ltr">{s.ip_prefix}</span>
              </p>
            </div>
            {s.current ? (
              <Badge tone="dark">{copy.thisDevice}</Badge>
            ) : (
              <button type="button" className="text-danger underline" onClick={() => revoke.mutate(s.id)}>
                {copy.revoke}
              </button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" className="mt-4" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending}>
        {copy.revokeOthers}
      </Button>
    </Section>
  );
}
