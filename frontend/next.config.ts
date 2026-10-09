import type { NextConfig } from "next";

/**
 * Same-origin topology: the browser talks to ONE origin (reverse proxy). `/api/v1/*` and
 * `/media/*` are routed to Django by the proxy (infra/Caddyfile); everything else is served by
 * this Next.js server. Server Components fetch public catalog data directly from the internal
 * Django URL (INTERNAL_API_URL) and cache it by tag; private data is fetched per request in the
 * browser with the user's session cookie and is never cached by Next.js.
 *
 * Cache Components is intentionally disabled: storefront routes render per request so a build
 * never depends on the API being reachable, while public API responses are cached in the data
 * cache with tags invalidated by Django (see src/app/internal/revalidate/route.ts).
 */
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  cacheComponents: false,
  reactCompiler: true,
  poweredByHeader: false,
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Product images are pre-sized by the backend (1600px + 640px WebP); no runtime optimizer.
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/studio-images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;
