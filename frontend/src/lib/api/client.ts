"use client";

/**
 * Browser API client (same-origin /api/v1). Session cookies are HttpOnly; the CSRF token is
 * obtained from /auth/csrf and kept in memory only (never in localStorage). Non-idempotent
 * mutations are NOT retried automatically; order creation and payment start carry an
 * Idempotency-Key so a user retry cannot create duplicates.
 */

import type { ApiErrorBody } from "./types";
import { common } from "@/content/fa";

const BASE = "/api/v1";
let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string[]>;
  requestId: string | null;
  body: ApiErrorBody["error"] | null;

  constructor(status: number, body: ApiErrorBody["error"] | null, fallback: string) {
    super(body?.message || fallback);
    this.status = status;
    this.code = body?.code || (status === 0 ? "network_error" : "server_error");
    this.fields = body?.fields || {};
    this.requestId = body?.request_id ?? null;
    this.body = body;
  }
}

export function setCsrfToken(token: string | null | undefined): void {
  if (token) csrfToken = token;
}

async function fetchCsrf(): Promise<string> {
  if (!csrfPromise) {
    csrfPromise = fetch(`${BASE}/auth/csrf`, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new ApiError(r.status, null, common.serverDown);
        const data = (await r.json()) as { csrf_token: string };
        csrfToken = data.csrf_token;
        return data.csrf_token;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  form?: FormData;
  idempotencyKey?: string;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, query?: Options["query"]): string {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method || "GET";
  const unsafe = method !== "GET";
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (unsafe) {
      headers["X-CSRFToken"] = csrfToken || (await fetchCsrf());
    }
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    return fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  };

  let response: Response;
  try {
    response = await doFetch();
    // The CSRF secret rotates on login/logout in another tab: refresh the token once and retry.
    // Safe to retry because a CSRF rejection means the server did not process the request.
    if (response.status === 403 && unsafe) {
      const peek = (await response.clone().json().catch(() => null)) as ApiErrorBody | null;
      if (peek?.error?.code === "csrf_failed") {
        csrfToken = null;
        await fetchCsrf();
        response = await doFetch();
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, null, common.networkError);
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const errBody = (data as ApiErrorBody | null)?.error ?? null;
    throw new ApiError(response.status, errBody, response.status >= 500 ? common.serverDown : common.error);
  }
  const maybeToken = (data as { csrf_token?: string } | null)?.csrf_token;
  if (maybeToken) setCsrfToken(maybeToken);
  return data as T;
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(error.fields)) out[k] = v[0];
  return out;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return common.error;
}
