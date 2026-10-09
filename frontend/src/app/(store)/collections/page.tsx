import NextImage from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Icon } from "@/components/ui/Icon";
import { ErrorBlock } from "@/components/ui/States";
import { common } from "@/content/fa";
import { getCollections } from "@/lib/api/public";
import type { Collection } from "@/lib/api/types";
import { faDigits } from "@/lib/format";

export const metadata: Metadata = { title: "کالکشن‌ها", alternates: { canonical: "/collections" } };

export default async function CollectionsPage() {
  await connection();
  let rows: Collection[] = [];
  let failed = false;
  try {
    rows = await getCollections();
  } catch {
    failed = true;
  }
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <h1 className="mb-8 border-b border-line-soft pb-6 text-3xl font-bold">کالکشن‌ها</h1>
      {failed ? <ErrorBlock message={common.serverDown} /> : null}
      <ul className="grid gap-6 md:grid-cols-3">
        {rows.map((c) => (
          <li key={c.slug}>
            <Link href={`/collections/${c.slug}`} className="group flex h-full flex-col border border-line bg-elevated">
              <div className="aspect-[4/3] overflow-hidden bg-surface">
                {c.image ? <NextImage width={1600} height={2000} src={c.image.thumb} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" /> : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h2 className="text-xl font-semibold">{c.name}</h2>
                <p className="text-sm text-ink-soft">{c.description}</p>
                <p className="mt-auto flex items-center justify-between pt-3 text-sm">
                  <span className="text-muted">{faDigits(c.product_count)} محصول</span>
                  <Icon name="arrow" className="size-4.5 transition-transform group-hover:-translate-x-1" />
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
