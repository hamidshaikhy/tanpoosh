import Link from "next/link";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import { brand, footer } from "@/content/fa";
import type { PublicSettings } from "@/lib/api/types";

const PRIMARY = [
  { href: "/pages/about", label: footer.about },
  { href: "/pages/contact", label: footer.contact },
  { href: "/pages/returns", label: footer.returns },
  { href: "/pages/size-guide", label: footer.sizeGuide },
  { href: "/pages/shipping", label: footer.shipping },
];
const SECONDARY = [
  { href: "/orders/track", label: footer.track },
  { href: "/pages/privacy", label: footer.privacy },
  { href: "/pages/terms", label: footer.terms },
];

export function Footer({ settings }: { settings: PublicSettings | null }) {
  const social = settings?.social;
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:px-8">
        <div className="flex items-center gap-4 lg:order-1">
          {social?.instagram ? (
            <a href={social.instagram} rel="noopener noreferrer" target="_blank" aria-label="اینستاگرام تن‌پوش" className="p-1 hover:opacity-70">
              <Icon name="instagram" />
            </a>
          ) : null}
          {social?.telegram ? (
            <a href={social.telegram} rel="noopener noreferrer" target="_blank" aria-label="تلگرام تن‌پوش" className="p-1 hover:opacity-70">
              <Icon name="telegram" />
            </a>
          ) : null}
          <Link href="/" aria-label={brand.homeLabel} className="lg:hidden">
            <BrandLogo className="h-5 w-auto" />
          </Link>
        </div>
        <nav aria-label="پیوندهای پانویس" className="lg:order-2">
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-ink-soft lg:justify-center">
            {PRIMARY.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted lg:justify-center">
            {SECONDARY.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link href="/" aria-label={brand.homeLabel} className="hidden lg:order-3 lg:block">
          <BrandLogo className="h-6 w-auto" />
        </Link>
      </div>
      <div className="border-t border-line-soft">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">
          {settings?.footer_about ? `${settings.footer_about} ` : null}
          {footer.rights}
        </p>
      </div>
    </footer>
  );
}
