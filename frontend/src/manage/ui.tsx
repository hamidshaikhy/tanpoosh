"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { faDigits } from "@/lib/format";

export function PageHeader({ title, subtitle, actions, crumbs }: { title: string; subtitle?: string; actions?: ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {crumbs?.length ? (
          <nav aria-label="مسیر" className="mb-1 text-xs text-muted">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                <a href={c.href} className="hover:text-ink">
                  {c.label}
                </a>
                {i < crumbs.length - 1 ? " / " : ""}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`border border-line bg-elevated ${className}`}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
          {title ? <h2 className="font-semibold">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto border border-line bg-elevated">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-alt/50 text-start">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-2.5 text-start font-medium text-ink-soft">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">{children}</tbody>
      </table>
      {empty ? <p className="px-4 py-10 text-center text-sm text-muted">موردی برای نمایش وجود ندارد.</p> : null}
    </div>
  );
}

export function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="mt-4 flex items-center gap-4 text-sm">
      <button type="button" className="flex items-center gap-1 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <Icon name="chevron" className="size-4 -scale-x-100" /> قبلی
      </button>
      <span className="text-muted">
        صفحهٔ {faDigits(page)} از {faDigits(total)}
      </span>
      <button type="button" className="flex items-center gap-1 disabled:opacity-40" disabled={page >= total} onClick={() => onChange(page + 1)}>
        بعدی <Icon name="chevron" className="size-4" />
      </button>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>;
}

export function MiniSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 min-w-36 border border-line bg-elevated px-2 text-sm text-ink">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = "جستجو…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      جستجو
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-56 border border-line bg-elevated px-3 text-sm text-ink" maxLength={60} />
    </label>
  );
}
