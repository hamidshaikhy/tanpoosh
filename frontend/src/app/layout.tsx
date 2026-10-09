import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Providers } from "@/components/Providers";
import { brand, nav } from "@/content/fa";

import "./globals.css";

// Estedad (SIL Open Font License 1.1, self-hosted) — modern geometric Persian sans for UI and headings.
const estedad = localFont({
  src: "../fonts/Estedad-wght.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-estedad",
  preload: true,
  fallback: ["Tahoma", "system-ui", "sans-serif"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8088";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "تن‌پوش | پوشاک روزمرهٔ مردانه", template: "%s | تن‌پوش" },
  description: "خرید آنلاین کاپشن، تیشرت، شلوار و کفش مردانه با طراحی مینیمال و استودیوی پرو روی مدل.",
  applicationName: brand.name,
  openGraph: { locale: "fa_IR", siteName: brand.name, type: "website" },
  alternates: { canonical: "/" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f5f1e8",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page needs the request's CSP nonce, including studio and management.
  await connection();
  return (
    <html lang="fa" dir="rtl" className={estedad.variable}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-[200] focus:bg-ink focus:px-4 focus:py-2 focus:text-bg"
        >
          {nav.skip}
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
