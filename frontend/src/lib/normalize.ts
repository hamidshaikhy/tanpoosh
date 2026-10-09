/** Client-side input normalization mirroring the backend (backend remains authoritative). */
import { toAsciiDigits } from "./format";

export function normalizePersian(value: string): string {
  return value
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ـ/g, "")
    .replace(/[‪-‮⁦-⁩]/g, "");
}

export function normalizeMobile(value: string): string | null {
  let digits = toAsciiDigits(value).replace(/[\s\-()]/g, "");
  if (digits.startsWith("+98")) digits = "0" + digits.slice(3);
  else if (digits.startsWith("0098")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("98") && digits.length === 12) digits = "0" + digits.slice(2);
  else if (digits.startsWith("9") && digits.length === 10) digits = "0" + digits;
  return /^09\d{9}$/.test(digits) ? digits : null;
}

export function normalizePostal(value: string): string | null {
  const digits = toAsciiDigits(value).replace(/[\s-]/g, "");
  return /^\d{10}$/.test(digits) && new Set(digits).size > 1 ? digits : null;
}

/** Only allow safe in-site redirect targets (prevents open redirects after login). */
export function safeNext(value: string | null | undefined, fallback = "/account"): string {
  if (!value) return fallback;
  // Next/router and proxies may decode escaped separators; inspect the decoded form too.
  try {
    const decoded = decodeURIComponent(value);
    if (/[%\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return fallback;
  } catch {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /^\/+[a-z]+:/i.test(value)) return fallback;
  try {
    const url = new URL(value, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
