import Link from "next/link";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { buttonClass } from "@/components/ui/Button";
import { brand, common } from "@/content/fa";

export default function NotFound() {
  return (
    <main id="main" className="grain flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Link href="/" aria-label={brand.homeLabel}>
        <BrandLogo className="h-6 w-auto" />
      </Link>
      <p className="num text-6xl font-light text-muted">۴۰۴</p>
      <h1 className="text-2xl font-bold">{common.notFound}</h1>
      <p className="max-w-md text-ink-soft">{common.notFoundBody}</p>
      <div className="flex gap-3">
        <Link href="/" className={buttonClass("primary")}>
          {common.home}
        </Link>
        <Link href="/shop" className={buttonClass("secondary")}>
          پوشاک
        </Link>
      </div>
    </main>
  );
}
