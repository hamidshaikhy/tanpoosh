import { describe, expect, it } from "vitest";
import { faDigits, groupNumber, jalali, shortToman, sizeLabel, toAsciiDigits, toman } from "./format";

describe("Persian display", () => {
  it("preserves punctuation and converts both numeral alphabets", () => {
    expect(faDigits("+98 12.5")).toBe("+۹۸ ۱۲.۵");
    expect(toAsciiDigits("۰۱۲٣٤٥۶۷۸۹")).toBe("0123456789");
  });
  it("formats canonical integer toman without currency conversion", () => {
    expect(toman(12_000_000)).toBe("۱۲,۰۰۰,۰۰۰ تومان");
    expect(toman(0)).toBe("۰ تومان");
    expect(toman(null)).toBe("—");
    expect(groupNumber(4_800_000)).toBe("۴,۸۰۰,۰۰۰");
    expect(shortToman(4_800_000)).toBe("۴٫۸ میلیون تومان");
  });
  it("uses Jalali and Tehran even across a UTC midnight boundary", () => {
    expect(jalali("2026-03-20T21:00:00Z", { short: true })).toBe("۱۴۰۵/۰۱/۰۱");
    expect(jalali("bad date")).toBe("—");
    expect(sizeLabel("42")).toBe("۴۲");
    expect(sizeLabel("XL")).toBe("XL");
  });
});
