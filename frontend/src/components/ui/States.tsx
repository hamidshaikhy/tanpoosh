import type { ReactNode } from "react";

import { common } from "@/content/fa";

import { Spinner } from "./Button";
import { Icon } from "./Icon";

export function LoadingBlock({ label = common.loading, className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-16 text-sm text-muted ${className}`} role="status" aria-live="polite">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({ message = common.error, onRetry, className = "" }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-4 border border-danger/30 bg-danger-bg px-6 py-10 text-center text-danger ${className}`} role="alert">
      <Icon name="alert" className="size-6" />
      <p className="max-w-md text-sm leading-7">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="text-sm text-ink underline decoration-accent decoration-2 underline-offset-8">
          {common.retry}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ title, hint, action, icon = "box" }: { title: string; hint?: string; action?: ReactNode; icon?: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-line px-6 py-14 text-center">
      <Icon name={icon} className="size-8 text-muted" />
      <p className="text-base">{title}</p>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Notice({ tone = "info", children, className = "" }: { tone?: "info" | "warning" | "success" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    info: "border-line bg-surface-alt/60 text-ink-soft",
    warning: "border-warning/30 bg-warning-bg text-warning",
    success: "border-success/30 bg-success-bg text-success",
    danger: "border-danger/30 bg-danger-bg text-danger",
  } as const;
  return (
    <div className={`flex items-start gap-2.5 border px-4 py-3 text-sm leading-7 ${tones[tone]} ${className}`} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={tone === "success" ? "check" : tone === "info" ? "info" : "alert"} className="mt-1 size-4" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "dark" }) {
  const tones = {
    neutral: "bg-surface-alt text-ink-soft",
    accent: "bg-accent text-accent-ink",
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    danger: "bg-danger-bg text-danger",
    dark: "bg-ink text-bg",
  } as const;
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium leading-5 ${tones[tone]}`}>{children}</span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-alt ${className}`} aria-hidden="true" />;
}
