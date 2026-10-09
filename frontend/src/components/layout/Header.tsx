"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import { brand, nav } from "@/content/fa";
import { faDigits } from "@/lib/format";
import { useCart, useLogout, useMe } from "@/lib/queries";
import { useUI } from "@/lib/ui-store";

import { MobileNav } from "./MobileNav";

export const NAV_LINKS = [
  { href: "/shop?is_new=1&sort=newest", label: nav.newest },
  { href: "/shop", label: nav.clothing },
  { href: "/collections", label: nav.collections },
  { href: "/studio", label: nav.studio },
];

export function Header({ announcement }: { announcement: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const newest = pathname === "/shop" && params.get("is_new") === "1";
  const overlay = pathname === "/";
  const { data: cart } = useCart();
  const setSearch = useUI((s) => s.setSearch);
  const openCart = useUI((s) => s.openCart);
  const setNav = useUI((s) => s.setNav);
  const count = cart?.item_count ?? 0;

  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-40" : "relative z-40 border-b border-line-soft bg-bg"}>
      {announcement ? (
        <div className="bg-night text-night-ink">
          <p className="mx-auto max-w-7xl px-4 py-2 text-center text-[13px] leading-6">{announcement}</p>
        </div>
      ) : null}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:h-[72px] sm:px-6 lg:px-8">
        <button
          type="button"
          className="-ms-2 p-2 lg:hidden"
          onClick={() => setNav(true)}
          aria-label={nav.menu}
          aria-haspopup="dialog"
        >
          <Icon name="menu" />
        </button>
        <Link href="/" aria-label={brand.homeLabel} className="shrink-0">
          <BrandLogo variant="dark-wordmark" className="h-[18px] w-auto sm:h-[22px]" />
        </Link>
        <nav aria-label={nav.mainNav} className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-8 ps-8 text-[15px]">
            {NAV_LINKS.map((l) => {
              const active = l.href.includes("is_new=1") ? newest : l.href === "/shop" ? pathname === "/shop" && !newest : pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`py-2 transition-colors hover:text-ink ${active ? "text-ink underline decoration-accent decoration-2 underline-offset-[10px]" : "text-ink-soft"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:gap-3">
          <button type="button" onClick={() => setSearch(true)} className="p-2 hover:opacity-70" aria-label={nav.search} aria-haspopup="dialog">
            <Icon name="search" />
          </button>
          <AccountMenu />
          <button
            type="button"
            onClick={openCart}
            className="flex items-center gap-2 p-2 text-[15px] hover:opacity-70"
            aria-label={`${nav.bag}، ${faDigits(count)} کالا`}
            aria-haspopup="dialog"
            data-testid="header-cart"
          >
            <span className="hidden sm:inline">
              {nav.bag} <span className="num">({faDigits(count)})</span>
            </span>
            <span className="relative">
              <Icon name="bag" className="size-6" />
              <span className="absolute -top-1 -left-1.5 flex min-w-4 items-center justify-center bg-ink px-1 text-[10px] leading-4 text-bg sm:hidden">
                {faDigits(count)}
              </span>
            </span>
          </button>
        </div>
      </div>
      <MobileNav />
    </header>
  );
}

function AccountMenu() {
  const { data: me } = useMe();
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname; // navigating closes the menu without an effect
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof v === "function" ? v(open) : v) ? pathname : null);
  const ref = useRef<HTMLDivElement>(null);
  const logout = useLogout();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me?.authenticated) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname || "/")}`} className="p-2 hover:opacity-70" aria-label={nav.login}>
        <Icon name="user" />
      </Link>
    );
  }
  const user = me.user!;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="p-2 hover:opacity-70"
        aria-label={`${nav.account}: ${user.first_name || user.username}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        data-testid="account-menu"
      >
        <Icon name="user" />
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-56 border border-line bg-elevated py-2 shadow-soft">
          <p className="border-b border-line-soft px-4 pb-2 text-sm text-muted">{user.first_name || user.username}</p>
          {[
            ["/account", nav.account],
            ["/account/orders", "سفارش‌ها"],
            ["/account/wishlist", "علاقه‌مندی‌ها"],
            ["/account/looks", "استایل‌های من"],
          ].map(([href, label]) => (
            <Link key={href} role="menuitem" href={href} className="block px-4 py-2 text-sm hover:bg-surface-alt">
              {label}
            </Link>
          ))}
          {user.is_staff ? (
            <Link role="menuitem" href="/manage" className="block px-4 py-2 text-sm font-medium hover:bg-surface-alt">
              {nav.manage}
            </Link>
          ) : null}
          <button
            role="menuitem"
            type="button"
            className="block w-full px-4 py-2 text-start text-sm text-danger hover:bg-surface-alt"
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                  router.push("/");
                  router.refresh();
                },
              })
            }
          >
            {nav.logout}
          </button>
        </div>
      ) : null}
    </div>
  );
}
