import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8088";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/checkout", "/bag", "/payment", "/manage", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/orders", "/api/", "/internal/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
