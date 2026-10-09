"use client";

import { product as copy } from "@/content/fa";
import type { CardColor, PublicVariant } from "@/lib/api/types";
import { sizeLabel } from "@/lib/format";
import { sizeSortKey } from "@/lib/sizes";

export function ColorPicker({
  colors,
  value,
  onChange,
  name,
}: {
  colors: CardColor[];
  value: string | null;
  onChange: (code: string) => void;
  name: string;
}) {
  const current = colors.find((c) => c.code === value);
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-ink-soft">
        {copy.color}: <span className="text-ink">{current?.name ?? "—"}</span>
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={copy.color}>
        {colors.map((c) => (
          <label key={c.code} className="relative cursor-pointer" title={c.name}>
            <input
              type="radio"
              name={`${name}-color`}
              value={c.code}
              checked={value === c.code}
              onChange={() => onChange(c.code)}
              className="peer sr-only"
            />
            <span
              className="block size-9 rounded-full border border-ink/20 ring-offset-2 ring-offset-bg peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink"
              style={{ backgroundColor: c.hex }}
            />
            <span className="sr-only">
              {c.name}
              {!c.in_stock ? ` (${copy.outOfStock})` : ""}
            </span>
            {!c.in_stock ? <span className="pointer-events-none absolute inset-0 m-auto h-px w-10 -rotate-45 bg-ink/50" aria-hidden="true" /> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SizePicker({
  variants,
  color,
  value,
  onChange,
  name,
  error,
}: {
  variants: PublicVariant[];
  color: string | null;
  value: string | null;
  onChange: (size: string) => void;
  name: string;
  error?: string;
}) {
  const forColor = variants.filter((v) => v.color_code === color).sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size));
  return (
    <fieldset aria-describedby={error ? `${name}-size-error` : undefined}>
      <legend className="mb-2 text-sm text-ink-soft">{copy.chooseSize}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={copy.chooseSize}>
        {forColor.map((v) => (
          <label key={v.id} className={`relative ${v.in_stock ? "cursor-pointer" : "cursor-not-allowed"}`}>
            <input
              type="radio"
              name={`${name}-size`}
              value={v.size}
              checked={value === v.size}
              disabled={!v.in_stock}
              onChange={() => onChange(v.size)}
              className="peer sr-only"
            />
            <span
              className={`flex h-11 min-w-12 items-center justify-center border px-3 text-sm transition-colors ltr peer-checked:border-ink peer-checked:bg-ink peer-checked:text-bg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                v.in_stock ? "border-line hover:border-ink" : "border-line-soft text-muted line-through"
              }`}
            >
              {sizeLabel(v.size)}
            </span>
            <span className="sr-only">{!v.in_stock ? copy.outOfStock : v.low_stock ? copy.lowStock : ""}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${name}-size-error`} role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
