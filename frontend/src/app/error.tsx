"use client";

import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { common } from "@/content/fa";

export default function ErrorPage({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <main id="main" className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-4 text-center">
      <h1 className="text-2xl font-bold">{common.error}</h1>
      <p className="max-w-md text-ink-soft">{common.serverDown}</p>
      {error.digest ? <p className="ltr text-xs text-muted">ref: {error.digest}</p> : null}
      <div className="flex gap-3">
        <button type="button" onClick={reset} className={buttonClass("primary")}>
          {common.retry}
        </button>
        <Link href="/" className={buttonClass("secondary")}>
          {common.home}
        </Link>
      </div>
    </main>
  );
}
