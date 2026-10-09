import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { brand } from "@/content/fa";

export function AuthShell({ title, subtitle, children, footer, tone = "light" }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; tone?: "light" | "night" }) {
  return (
    <div className={`grain flex min-h-[calc(100dvh-140px)] items-center justify-center px-4 py-12 ${tone === "night" ? "bg-night" : ""}`}>
      <div className="w-full max-w-md border border-line bg-elevated p-7 shadow-soft sm:p-9">
        <Link href="/" aria-label={brand.homeLabel} className="mb-8 inline-block">
          <BrandLogo className="h-5 w-auto" />
        </Link>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm leading-7 text-ink-soft">{subtitle}</p> : null}
        <div className="mt-7">{children}</div>
        {footer ? <div className="mt-7 border-t border-line-soft pt-5 text-sm text-ink-soft">{footer}</div> : null}
      </div>
    </div>
  );
}
