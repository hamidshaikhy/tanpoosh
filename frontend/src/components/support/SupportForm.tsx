"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { SelectField, TextareaField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { support as copy } from "@/content/fa";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import { useMe } from "@/lib/queries";

export function SupportForm({ onSent }: { onSent?: () => void }) {
  const { data: me } = useMe();
  const user = me?.authenticated ? me.user : null;
  const [form, setForm] = useState({ name: "", email: "", topic: "order", subject: "", body: "", order_number: "" });
  const send = useMutation({
    mutationFn: () =>
      api<{ detail: string }>("/support/messages", {
        method: "POST",
        body: { ...form, name: form.name || (user ? `${user.first_name} ${user.last_name}`.trim() || user.username : ""), email: user?.email || form.email },
      }),
    onSuccess: () => onSent?.(),
  });
  const errors = fieldErrors(send.error);
  if (send.isSuccess) return <Notice tone="success">{send.data.detail}</Notice>;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      {!user ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={copy.name} required value={form.name} onChange={set("name")} error={errors.name} maxLength={120} autoComplete="name" />
          <TextField label={copy.email} required type="email" ltr value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={copy.topic} value={form.topic} onChange={set("topic")}>
          {copy.topics.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        <TextField label={copy.orderNumber} ltr value={form.order_number} onChange={set("order_number")} error={errors.order_number} maxLength={20} />
      </div>
      <TextField label={copy.subject} required value={form.subject} onChange={set("subject")} error={errors.subject} maxLength={120} />
      <TextareaField label={copy.body} required value={form.body} onChange={set("body")} error={errors.body} maxLength={3000} />
      {send.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(send.error)}</Notice> : null}
      <Button type="submit" loading={send.isPending} className="self-start">
        {copy.send}
      </Button>
    </form>
  );
}
