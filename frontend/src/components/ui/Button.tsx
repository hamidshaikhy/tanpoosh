import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "link" | "danger" | "accent" | "night";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-ink-soft border border-ink",
  secondary: "bg-transparent text-ink border border-ink/70 hover:bg-ink hover:text-bg",
  ghost: "bg-transparent text-ink hover:bg-surface-alt border border-transparent",
  link: "bg-transparent text-ink underline decoration-accent decoration-2 underline-offset-[10px] hover:decoration-ink px-0",
  danger: "bg-danger text-white hover:opacity-90 border border-danger",
  accent: "bg-accent text-accent-ink hover:brightness-95 border border-accent",
  night: "bg-night-ink text-night hover:bg-white border border-night-ink",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${variant === "link" ? "h-auto text-[15px]" : sizes[size]} ${extra}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, icon, className = "", children, disabled, ...rest }: Props) {
  return (
    <button
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  icon,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; icon?: ReactNode; prefetch?: boolean }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
      {icon}
    </Link>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
