"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PageTitle } from "@/components/account/AccountShell";
import { AddressFields, EMPTY_ADDRESS, type AddressValue } from "@/components/checkout/AddressFields";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, TextField } from "@/components/ui/Field";
import { Badge, EmptyBlock, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { account as copy } from "@/content/fa";
import { api, errorMessage, fieldErrors } from "@/lib/api/client";
import type { Address } from "@/lib/api/types";
import { faDigits } from "@/lib/format";
import { keys } from "@/lib/queries";

type Editing = { id: string | null; title: string; is_default: boolean; value: AddressValue };

export default function AddressesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: keys.addresses, queryFn: () => api<Address[]>("/account/addresses") });
  const [editing, setEditing] = useState<Editing | null>(null);
  const save = useMutation({
    mutationFn: (e: Editing) =>
      e.id
        ? api<Address>(`/account/addresses/${e.id}`, { method: "PATCH", body: { ...e.value, title: e.title, is_default: e.is_default } })
        : api<Address>("/account/addresses", { method: "POST", body: { ...e.value, title: e.title, is_default: e.is_default } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.addresses });
      setEditing(null);
      toast.success(copy.saved);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/account/addresses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const makeDefault = useMutation({
    mutationFn: (id: string) => api(`/account/addresses/${id}`, { method: "PATCH", body: { is_default: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses }),
  });
  const errors = fieldErrors(save.error);

  return (
    <div>
      <PageTitle
        action={
          <Button size="sm" onClick={() => setEditing({ id: null, title: "", is_default: false, value: EMPTY_ADDRESS })}>
            {copy.addAddress}
          </Button>
        }
      >
        {copy.addresses}
      </PageTitle>
      {list.isLoading ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : null}
      {list.data && !list.data.length ? <EmptyBlock title={copy.noAddresses} icon="truck" /> : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {list.data?.map((a) => (
          <li key={a.id} className={`flex flex-col gap-2 border p-5 text-sm ${a.is_default ? "border-ink" : "border-line"}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.title || a.recipient_name}</span>
              {a.is_default ? <Badge tone="dark">{copy.default}</Badge> : null}
            </div>
            <p className="text-ink-soft">
              {a.recipient_name} — {a.province}، {a.city}، {a.line}
            </p>
            <p className="ltr text-start text-muted">
              {faDigits(a.postal_code)} · {a.phone}
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              <button
                type="button"
                className="underline"
                onClick={() =>
                  setEditing({
                    id: a.id,
                    title: a.title,
                    is_default: a.is_default,
                    value: { recipient_name: a.recipient_name, phone: a.phone, province: a.province, city: a.city, postal_code: a.postal_code, line: a.line, plaque: a.plaque, unit: a.unit },
                  })
                }
              >
                {copy.editAddress}
              </button>
              {!a.is_default ? (
                <button type="button" className="underline" onClick={() => makeDefault.mutate(a.id)}>
                  {copy.makeDefault}
                </button>
              ) : null}
              <button type="button" className="text-danger underline" onClick={() => remove.mutate(a.id)}>
                {copy.deleteAddress}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? copy.editAddress : copy.addAddress} size="lg">
        {editing ? (
          <form
            noValidate
            className="flex flex-col gap-5 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
          >
            <TextField label={copy.addressTitle} optionalLabel="اختیاری" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={40} />
            <AddressFields value={editing.value} onChange={(v) => setEditing({ ...editing, value: v })} errors={errors} />
            <Checkbox label={copy.makeDefault} checked={editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
            {save.isError && !Object.keys(errors).length ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
            <Button type="submit" loading={save.isPending} className="self-start">
              {copy.save}
            </Button>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
