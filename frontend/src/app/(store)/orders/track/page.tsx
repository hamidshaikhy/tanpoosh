"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { account as copy } from "@/content/fa";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";

export default function TrackOrderPage() {
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const lookup = useMutation({ mutationFn: () => api<{ detail: string }>("/orders/lookup", { method: "POST", body: { number, email } }) });
  const errors = fieldErrors(lookup.error);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold">{copy.guestTitle}</h1>
      <p className="mt-3 leading-8 text-ink-soft">{copy.guestBody}</p>
      {lookup.isSuccess ? (
        <Notice tone="success" className="mt-6">
          {lookup.data.detail}
        </Notice>
      ) : (
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            lookup.mutate();
          }}
        >
          <TextField label={copy.orderNumber} required ltr placeholder="TP050715-ABCDE" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={20} error={errors.number} />
          <TextField label="ایمیل" type="email" required ltr autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          {lookup.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(lookup.error)}</Notice> : null}
          <Button type="submit" loading={lookup.isPending}>
            {copy.sendLink}
          </Button>
        </form>
      )}
    </div>
  );
}
