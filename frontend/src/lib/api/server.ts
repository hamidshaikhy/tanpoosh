import "server-only";

/**
 * Server-side fetch of PUBLIC catalog/content data from Django's internal URL. Responses are
 * cached in the Next.js data cache with tags and invalidated on demand by Django
 * (POST /internal/revalidate). Never use this for private/account data — it sends no cookies.
 */

const INTERNAL = (process.env.INTERNAL_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class ServerApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Opts = { tags?: string[]; revalidate?: number; query?: Record<string, string | undefined> };

export async function publicGet<T>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(`${INTERNAL}/api/v1${path}`);
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: opts.revalidate ?? 300, tags: ["catalog", ...(opts.tags || [])] },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ServerApiError(503, "API unreachable");
  }
  if (!res.ok) throw new ServerApiError(res.status, `API ${res.status}`);
  return (await res.json()) as T;
}

export async function publicGetOrNull<T>(path: string, opts: Opts = {}): Promise<T | null> {
  try {
    return await publicGet<T>(path, opts);
  } catch (err) {
    if (err instanceof ServerApiError && err.status === 404) return null;
    throw err;
  }
}
