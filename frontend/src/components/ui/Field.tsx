"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { auth } from "@/content/fa";

import { Icon } from "./Icon";

const control =
  "w-full bg-elevated border border-line text-ink placeholder:text-muted/70 px-3.5 h-12 text-[15px] transition-colors focus:outline-none focus:border-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink aria-[invalid=true]:border-danger";

type FieldShellProps = { id: string; label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; optionalLabel?: string };

export function FieldShell({ id, label, error, hint, required, children, optionalLabel }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-soft">
        {label}
        {required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
        {optionalLabel ? <span className="text-muted font-normal"> ({optionalLabel})</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger flex items-start gap-1" role="alert">
          <Icon name="alert" className="size-4 mt-0.5" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; ltr?: boolean; optionalLabel?: string };

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, error, hint, ltr, className = "", required, optionalLabel, id: givenId, ...rest },
  ref,
) {
  const autoId = useId();
  const id = givenId || autoId;
  const describedBy = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} optionalLabel={optionalLabel}>
      <input
        ref={ref}
        id={id}
        className={`${control} ${ltr ? "ltr text-left" : ""} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        dir={ltr ? "ltr" : undefined}
        {...rest}
      />
    </FieldShell>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, Omit<InputProps, "type">>(function PasswordField(
  { label, error, hint, className = "", required, id: givenId, ...rest },
  ref,
) {
  const autoId = useId();
  const id = givenId || autoId;
  const [visible, setVisible] = useState(false);
  const describedBy = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          className={`${control} ltr text-left pe-3.5 ps-12 ${className}`}
          dir="ltr"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          spellCheck={false}
          autoCapitalize="none"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 left-0 flex w-12 items-center justify-center text-muted hover:text-ink"
          aria-label={visible ? auth.hidePassword : auth.showPassword}
          aria-pressed={visible}
        >
          <Icon name={visible ? "eye-off" : "eye"} />
        </button>
      </div>
    </FieldShell>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; children: ReactNode };

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField(
  { label, error, hint, className = "", required, id: givenId, children, ...rest },
  ref,
) {
  const autoId = useId();
  const id = givenId || autoId;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          className={`${control} appearance-none pe-3.5 ps-10 ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-required={required || undefined}
          {...rest}
        >
          {children}
        </select>
        <Icon name="chevron-down" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      </div>
    </FieldShell>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string; optionalLabel?: string };

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextareaField(
  { label, error, hint, className = "", required, id: givenId, optionalLabel, ...rest },
  ref,
) {
  const autoId = useId();
  const id = givenId || autoId;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} optionalLabel={optionalLabel}>
      <textarea
        ref={ref}
        id={id}
        className={`${control} h-auto min-h-28 py-3 leading-7 ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        aria-required={required || undefined}
        {...rest}
      />
    </FieldShell>
  );
});

export function Checkbox({ label, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft ${className}`}>
      <input type="checkbox" className="size-4.5 accent-ink" {...rest} />
      <span>{label}</span>
    </label>
  );
}
