import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce + security headers, and `noindex` for private routes.
 * The /manage redirect below is a UX convenience only — authorization is enforced by Django
 * on every API call (a missing/forged cookie gets 401/403 from the API).
 *
 * CSP notes (documented exceptions):
 *  - style-src allows 'unsafe-inline' because React style attributes (color swatches), Motion
 *    animations and color swatches set inline styles; nonces cannot cover style attributes.
 *  - 'unsafe-eval' only in development (React debugging), never in production.
 */
const PRIVATE_PREFIXES = ["/account", "/checkout", "/bag", "/payment", "/manage", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/orders"];
const SESSION_COOKIES = ["tp_session", "__Host-tp_session"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/manage") && !pathname.startsWith("/manage/login")) {
    const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/manage/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const mediaOrigin = process.env.MEDIA_ORIGIN ? ` ${process.env.MEDIA_ORIGIN}` : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${mediaOrigin}`,
    "font-src 'self'",
    `connect-src 'self' blob: data:${isDev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|media|_next/static|_next/image|favicon.ico|brand|editorial|studio-images|internal).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
