"use client";

import Link from "next/link";
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { product as copy, sizeGuide } from "@/content/fa";

export function SizeTable({ chart }: { chart: "tops" | "bottoms" | "shoes" }) {
  const t = sizeGuide[chart];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-sm">
        <caption className="mb-3 text-start font-medium">{t.caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {t.head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 text-start font-medium text-ink-soft">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row) => (
            <tr key={row[0]} className="border-b border-line-soft">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="ltr px-3 py-2 text-start font-medium">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="num px-3 py-2">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SizeGuideButton({ chart }: { chart: "tops" | "bottoms" | "shoes" | "none" }) {
  const [open, setOpen] = useState(false);
  if (chart === "none") return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm underline decoration-line decoration-1 underline-offset-8 hover:decoration-ink" aria-haspopup="dialog">
        {copy.sizeGuide}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={sizeGuide.title} size="lg">
        <div className="flex flex-col gap-5 p-5">
          <SizeTable chart={chart} />
          <p className="text-xs text-muted">{sizeGuide.note}</p>
          <p className="border-s-2 border-accent ps-3 text-sm leading-7 text-ink-soft">{sizeGuide.studioNote}</p>
          <Link href="/pages/size-guide" className="self-start text-sm underline decoration-accent decoration-2 underline-offset-8">
            راهنمای کامل سایز
          </Link>
        </div>
      </Dialog>
    </>
  );
}
