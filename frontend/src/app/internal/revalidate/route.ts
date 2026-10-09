import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Internal cache invalidation endpoint called by Django (outbox task) after catalog/content
 * changes. Protected by a shared secret and blocked at the public reverse proxy
 * (infra/Caddyfile responds 404 for /internal/*).
 */
const TAG_RE = /^[a-z0-9:_-]{1,120}$/i;

function authorized(request: NextRequest): boolean {
  const secret = process.env.REVALIDATE_SECRET || "";
  const given = request.headers.get("x-revalidate-secret") || "";
  if (secret.length < 32 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === "string" && TAG_RE.test(t)).slice(0, 50) : [];
  for (const tag of tags) {
    // Immediate expiry: the next storefront request refetches (admin publish -> visible on refresh).
    revalidateTag(tag, { expire: 0 });
  }
  return Response.json({ ok: true, revalidated: tags });
}
