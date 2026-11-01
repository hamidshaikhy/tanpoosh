import Link from "next/link";
import { connection } from "next/server";

import { StyleHero } from "@/components/home/StyleHero";
import { CategoryDisplay } from "@/components/home/CategoryDisplay";
import { RackTeaser } from "@/components/home/RackTeaser";
import { ProductRail } from "@/components/home/ProductRail";
import { LookDiscovery } from "@/components/home/LookDiscovery";
import { EyewearEdit } from "@/components/home/EyewearEdit";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ErrorBlock } from "@/components/ui/States";
import { common, home } from "@/content/fa";
import { getHome, getStudioCatalog } from "@/lib/api/public";
import type { Home } from "@/lib/api/types";

export default async function HomePage() {
  await connection(); // render per request; public data itself is cached by tag
  const studioRequest = getStudioCatalog().catch(() => null);
  let data: Home;
  try {
    data = await getHome();
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-40 pb-24">
        <ErrorBlock message={common.serverDown} />
      </div>
    );
  }
  const { hero, picks, categories, eyewear, featured_collection } = data;
  const studioCatalog = await studioRequest;

  return (
    <>
      <StyleHero hero={hero} products={studioCatalog?.products ?? []} />

      <CategoryDisplay categories={categories} />

      <RackTeaser />

      {/* EVERYDAY PICKS */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="picks-title">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="picks-title" className="text-3xl font-bold sm:text-[2.1rem]">
              {picks.title}
            </h2>
            <p className="mt-2 text-ink-soft">{picks.subtitle}</p>
          </div>
          <Link href="/shop" className="flex items-center gap-2 text-[15px] underline decoration-accent decoration-2 underline-offset-[10px] hover:decoration-ink">
            {home.viewAll}
            <Icon name="arrow" className="size-4.5" />
          </Link>
        </div>
        <ProductRail products={picks.products} />
      </section>

      {studioCatalog?.manifest ? <LookDiscovery manifest={studioCatalog.manifest} products={studioCatalog.products} /> : null}

      <EyewearEdit products={eyewear ?? []} />

      {/* FEATURED COLLECTION */}
      {featured_collection ? (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="collection-title">
          <div className="grid items-center gap-8 border border-line bg-elevated p-6 sm:p-10 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm text-muted">کالکشن</p>
              <h2 id="collection-title" className="mt-1 text-2xl font-bold sm:text-3xl">
                {featured_collection.name}
              </h2>
              <p className="mt-3 max-w-xl text-ink-soft">{featured_collection.description}</p>
            </div>
            <ButtonLink href={`/collections/${featured_collection.slug}`} variant="secondary" icon={<Icon name="arrow" />}>
              {home.collectionCta}
            </ButtonLink>
          </div>
        </section>
      ) : null}
    </>
  );
}
