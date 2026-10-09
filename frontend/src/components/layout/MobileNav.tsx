"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Dialog } from "@/components/ui/Dialog";
import { footer, nav } from "@/content/fa";
import { useMe } from "@/lib/queries";
import { useUI } from "@/lib/ui-store";

const LINKS = [
  { href: "/shop?is_new=1&sort=newest", label: nav.newest },
  { href: "/shop", label: nav.clothing },
  { href: "/shop?category=jackets", label: "کاپشن" },
  { href: "/shop?category=t-shirts", label: "تیشرت" },
  { href: "/shop?category=trousers", label: "شلوار" },
  { href: "/shop?category=shoes", label: "کفش" },
  { href: "/collections", label: nav.collections },
  { href: "/studio", label: nav.studio },
];

export function MobileNav() {
  const open = useUI((s) => s.navOpen);
  const setNav = useUI((s) => s.setNav);
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const { data: me } = useMe();

  useEffect(() => setNav(false), [pathname, query, setNav]);

  return (
    <Dialog open={open} onClose={() => setNav(false)} title={nav.menu} side="start">
      <div className="flex h-full flex-col gap-6 px-5 py-6">
        <BrandLogo className="h-5 w-auto self-start" />
        <nav aria-label={nav.mainNav}>
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setNav(false)} className="flex min-h-12 items-center text-base">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-3 text-sm text-ink-soft">
          {me?.authenticated ? (
            <>
              <Link href="/account">{nav.account}</Link>
              {me.user?.is_staff ? <Link href="/manage">{nav.manage}</Link> : null}
            </>
          ) : (
            <>
              <Link href="/login">{nav.login}</Link>
              <Link href="/signup">{nav.signup}</Link>
            </>
          )}
          <Link href="/orders/track">{footer.track}</Link>
          <Link href="/pages/contact">{footer.contact}</Link>
        </div>
      </div>
    </Dialog>
  );
}
