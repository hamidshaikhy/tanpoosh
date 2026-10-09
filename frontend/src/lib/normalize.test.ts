import { describe, expect, it } from "vitest";
import { normalizeMobile, normalizePersian, normalizePostal, safeNext } from "./normalize";

describe("input normalization", () => {
  it.each(["۰۹۱۲۱۲۳۴۵۶۷", "+98 (912) 123-4567", "00989121234567", "989121234567", "9121234567"])("accepts Iranian mobile %s", (input) => {
    expect(normalizeMobile(input)).toBe("09121234567");
  });
  it.each(["0912", "02112345678", "+449121234567", "091212345678"])("rejects invalid mobile %s", (v) => expect(normalizeMobile(v)).toBeNull());
  it("normalizes postal code and Persian search letters", () => {
    expect(normalizePostal("۱۴۳۵۹-۱۶۴۷۱")).toBe("1435916471");
    expect(normalizePostal("0000000000")).toBeNull();
    expect(normalizePersian("كـيف يكى\u202e")).toBe("کیف یکی");
  });
});

describe("safe login redirects", () => {
  it.each(["//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil.com", "/%2f%2fevil.com", "/%5cevil.com", "/\n/evil.com", "/%0a/evil.com"])("rejects %s", (v) => expect(safeNext(v)).toBe("/account"));
  it("preserves local query and fragment", () => expect(safeNext("/studio?product=polo-shirt#view")).toBe("/studio?product=polo-shirt#view"));
});
