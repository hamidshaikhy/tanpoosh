"use client";

import { useId, useState } from "react";

import { faDigits, jalali, shortToman, toman } from "@/lib/format";

/**
 * Single-series bar chart (daily gross, toman). Mark colour #7a8a2e validated against the
 * panel surface (lightness band, chroma floor, ≥3:1 contrast). Thin bars with 4px rounded
 * data-ends on the baseline, 2px gaps, recessive grid, per-bar hover/focus tooltip, and a
 * table view so no value is hover-only.
 */
const BAR = "#7a8a2e";

export function RevenueChart({ series }: { series: { date: string; gross: number; orders: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const titleId = useId();
  const W = 760;
  const H = 220;
  const pad = { top: 12, bottom: 28, left: 8, right: 64 };
  const max = Math.max(1, ...series.map((s) => s.gross));
  const niceMax = (() => {
    const pow = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / pow) * pow;
  })();
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const step = plotW / Math.max(1, series.length);
  const barW = Math.max(2, Math.min(18, step - 2));
  const ticks = [0, 0.5, 1].map((t) => t * niceMax);
  // RTL reading: newest day on the left edge would invert time; keep chronological left→right
  // like Persian financial charts commonly do, with dates labelled explicitly.
  const x = (i: number) => pad.left + i * step + (step - barW) / 2;
  const y = (v: number) => pad.top + plotH - (v / niceMax) * plotH;
  const labelEvery = Math.ceil(series.length / 6);
  const total = series.reduce((a, s) => a + s.gross, 0);

  if (!total) {
    return <p className="py-10 text-center text-sm text-muted">در این بازه پرداخت تأییدشده‌ای ثبت نشده است.</p>;
  }

  return (
    <figure className="flex flex-col gap-3" aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        نمودار فروش ناخالص روزانه به تومان
      </figcaption>
      <div className="relative" dir="ltr">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="فروش ناخالص روزانه">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth={1} />
              <text x={W - pad.right + 6} y={y(t) + 4} fontSize="11" fill="var(--muted)" fontFamily="var(--font-sans)">
                {t === 0 ? "۰" : shortToman(t).replace(" تومان", "")}
              </text>
            </g>
          ))}
          {series.map((s, i) => {
            const h = Math.max(0, y(0) - y(s.gross));
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={s.date}>
                {s.gross > 0 ? (
                  <path
                    d={`M${x(i)},${y(0)} V${y(s.gross) + r} Q${x(i)},${y(s.gross)} ${x(i) + r},${y(s.gross)} H${x(i) + barW - r} Q${x(i) + barW},${y(s.gross)} ${x(i) + barW},${y(s.gross) + r} V${y(0)} Z`}
                    fill={BAR}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                ) : null}
                <rect
                  x={pad.left + i * step}
                  y={pad.top}
                  width={step}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${jalali(s.date)}: ${toman(s.gross)}، ${faDigits(s.orders)} سفارش`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
                {i % labelEvery === 0 ? (
                  <text x={x(i) + barW / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--muted)" fontFamily="var(--font-sans)">
                    {jalali(s.date, { short: true }).slice(5)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth={1} />
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 border border-line bg-elevated px-3 py-2 text-sm shadow-soft"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)" }}
            dir="rtl"
          >
            <p className="num font-semibold">{toman(series[hover].gross)}</p>
            <p className="text-xs text-muted">
              {jalali(series[hover].date)} · {faDigits(series[hover].orders)} سفارش
            </p>
          </div>
        ) : null}
      </div>
      <button type="button" onClick={() => setTable((t) => !t)} className="self-start text-xs underline" aria-expanded={table}>
        {table ? "پنهان کردن جدول" : "نمایش جدول داده"}
      </button>
      {table ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-1 text-start font-medium">روز</th>
                <th className="py-1 text-start font-medium">فروش ناخالص</th>
                <th className="py-1 text-start font-medium">سفارش</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.date} className="border-b border-line-soft">
                  <td className="py-1">{jalali(s.date)}</td>
                  <td className="num py-1">{toman(s.gross)}</td>
                  <td className="num py-1">{faDigits(s.orders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
