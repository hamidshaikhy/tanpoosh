"use client";

import Link from "next/link";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import { brand, nav } from "@/content/fa";
import { faDigits } from "@/lib/format";
import { useCart, useMe } from "@/lib/queries";
import { useUI } from "@/lib/ui-store";

/** Dark studio header (reference B) with the inverse ivory wordmark. */
export function StudioHeader() {
  const { data: cart } = useCart();
  const { data: me } = useMe();
  const setSearch = useUI((s) => s.setSearch);
  const openCart = useUI((s) => s.openCart);
  const count = cart?.item_count ?? 0;
  return (
    <header className="shrink-0 bg-night text-night-ink">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label={brand.homeLabel} className="shrink-0">
          <BrandLogo variant="light-wordmark" className="h-[18px] w-auto sm:h-[22px]" />
        </Link>
        <nav aria-label={nav.mainNav} className="hidden flex-1 md:block">
          <ul className="flex items-center gap-8 ps-8 text-[15px]">
            <li>
              <Link href="/collections" className="hover:opacity-75">
                {nav.collections}
              </Link>
            </li>
            <li>
              <Link href="/studio" aria-current="page" className="underline decoration-accent decoration-2 underline-offset-[10px]">
                {nav.studio}
              </Link>
            </li>
            <li>
              <Link href="/shop" className="hover:opacity-75">
                {nav.clothing}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:gap-3">
          <button type="button" onClick={() => setSearch(true)} className="flex items-center gap-2 p-2 text-[15px] hover:opacity-75" aria-label={nav.search}>
            <Icon name="search" />
            <span className="hidden lg:inline">{nav.search}</span>
          </button>
          <Link href={me?.authenticated ? "/account" : "/login?next=/studio"} className="p-2 hover:opacity-75" aria-label={me?.authenticated ? nav.account : nav.login}>
            <Icon name="user" />
          </Link>
          <button type="button" onClick={openCart} className="flex items-center gap-2 p-2 text-[15px] hover:opacity-75" aria-label={`${nav.bag}، ${faDigits(count)} کالا`}>
            <span className="hidden sm:inline">
              {nav.bag} <span className="num">({faDigits(count)})</span>
            </span>
            <Icon name="bag" className="size-6" />
          </button>
        </div>
      </div>
    </header>
  );
}
