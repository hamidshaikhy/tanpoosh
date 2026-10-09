"use client";

import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { SelectField, TextField } from "@/components/ui/Field";
import { checkout as copy } from "@/content/fa";
import { api } from "@/lib/api/client";
import type { Province } from "@/lib/api/types";

export type AddressValue = {
  recipient_name: string;
  phone: string;
  province: string;
  city: string;
  postal_code: string;
  line: string;
  plaque: string;
  unit: string;
};

export const EMPTY_ADDRESS: AddressValue = { recipient_name: "", phone: "", province: "", city: "", postal_code: "", line: "", plaque: "", unit: "" };

export function useProvinces() {
  return useQuery({ queryKey: ["public", "provinces"], queryFn: () => api<Province[]>("/geo/provinces"), staleTime: Infinity });
}

export function AddressFields({
  value,
  onChange,
  errors,
  prefix = "address",
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  errors: Record<string, string>;
  prefix?: string;
}) {
  const provinces = useProvinces();
  const listId = useId();
  const cities = provinces.data?.find((p) => p.name === value.province)?.cities ?? [];
  const set = (key: keyof AddressValue) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });
  const err = (key: string) => errors[`${prefix}.${key}`] || errors[key];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label={copy.recipient} required autoComplete="shipping name" value={value.recipient_name} onChange={set("recipient_name")} error={err("recipient_name")} maxLength={120} />
      <TextField
        label={copy.phone}
        required
        type="tel"
        inputMode="tel"
        autoComplete="shipping tel"
        ltr
        hint={copy.phoneHint}
        value={value.phone}
        onChange={set("phone")}
        error={err("phone")}
        maxLength={20}
      />
      <SelectField
        label={copy.province}
        required
        autoComplete="shipping address-level1"
        value={value.province}
        onChange={(e) => onChange({ ...value, province: e.target.value, city: "" })}
        error={err("province")}
      >
        <option value="">انتخاب استان…</option>
        {provinces.data?.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </SelectField>
      <div>
        <TextField
          label={copy.city}
          required
          autoComplete="shipping address-level2"
          list={listId}
          value={value.city}
          onChange={set("city")}
          error={err("city")}
          disabled={!value.province}
          maxLength={60}
        />
        <datalist id={listId}>
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="sm:col-span-2">
        <TextField label={copy.line} required autoComplete="shipping street-address" value={value.line} onChange={set("line")} error={err("line")} maxLength={300} />
      </div>
      <TextField
        label={copy.postalCode}
        required
        inputMode="numeric"
        autoComplete="shipping postal-code"
        ltr
        value={value.postal_code}
        onChange={set("postal_code")}
        error={err("postal_code")}
        maxLength={14}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField label={copy.plaque} optionalLabel="اختیاری" value={value.plaque} onChange={set("plaque")} error={err("plaque")} maxLength={20} />
        <TextField label={copy.unit} optionalLabel="اختیاری" value={value.unit} onChange={set("unit")} error={err("unit")} maxLength={20} />
      </div>
    </div>
  );
}
