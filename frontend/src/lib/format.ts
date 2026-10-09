/** Persian display formatting: digits, toman amounts, Jalali dates (Asia/Tehran). */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function faDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function toAsciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** 4800000 -> «۴,۸۰۰,۰۰۰» (Persian digits; comma separator renders compactly in Estedad). */
export function groupNumber(value: number): string {
  return faDigits(Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
}

export function toman(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${groupNumber(value)} تومان`;
}

const jalaliDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const jalaliDateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const jalaliShort = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function jalali(value: string | Date | null | undefined, opts: { time?: boolean; short?: boolean } = {}): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  if (opts.short) return jalaliShort.format(date);
  return (opts.time ? jalaliDateTime : jalaliDate).format(date);
}

/** Sizes stay stable Latin identifiers; numeric sizes are shown with Persian digits. */
export function sizeLabel(code: string): string {
  if (code === "ONE") return "تک‌سایز";
  return /^\d+$/.test(code) ? faDigits(code) : code;
}

export function percent(value: number): string {
  return `${faDigits(value)}٪`;
}

export function shortToman(value: number): string {
  if (value >= 1_000_000 && value % 100_000 === 0) {
    const m = value / 1_000_000;
    return `${faDigits(Number.isInteger(m) ? m : m.toFixed(1).replace(".", "٫"))} میلیون تومان`;
  }
  return toman(value);
}
