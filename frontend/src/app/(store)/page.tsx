import NextImage from "next/image";
import Link from "next/link";
import { connection } from "next/server";

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
      {/* HERO — text at inline-start (right), photographed model at left */}
      <section className="relative overflow-hidden bg-[#ece7de]" aria-labelledby="hero-title">
        <div className="absolute top-24 bottom-0 left-0 w-full sm:inset-y-0 sm:w-[64%]">
          <NextImage
            src="/editorial/hero-young.webp"
            alt={home.heroImageAlt}
            className="size-full object-cover object-left-top sm:object-[62%_0%]"
            fetchPriority="high"
            loading="eager"
            width={1536}
            height={1024}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-[#ece7de] via-[#ece7de]/10 to-transparent sm:from-[#ece7de] sm:via-transparent" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#ece7de]/95 via-transparent to-transparent sm:hidden" aria-hidden="true" />
        </div>
        <div className="relative mx-auto flex min-h-[600px] max-w-7xl items-end px-4 pt-32 pb-12 sm:min-h-[640px] sm:items-center sm:px-6 lg:min-h-[680px] lg:px-8">
          <div className="max-w-md animate-slide-up sm:max-w-sm lg:max-w-md">
            <h1 id="hero-title" className="text-[2.35rem] leading-[1.35] font-bold sm:text-5xl sm:leading-[1.3] lg:text-[3.6rem]">
              <HeroTitle text={hero.title} />
            </h1>
            <span className="my-6 block h-px w-16 bg-ink" aria-hidden="true" />
            <p className="text-lg text-ink-soft">{hero.subtitle}</p>
            <div className="mt-8 flex flex-col items-start gap-5">
              <ButtonLink href={hero.primary.href} size="lg" className="min-w-64 justify-between" icon={<Icon name="arrow" />}>
                {hero.primary.label}
              </ButtonLink>
              <Link
                href={hero.secondary.href}
                className="flex items-center gap-3 text-[15px] underline decoration-accent decoration-2 underline-offset-[10px] hover:decoration-ink"
              >
                {hero.secondary.label}
                <Icon name="arrow" className="size-4.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORY STRIP */}
      {categories.length ? (
        <section aria-label="دسته‌بندی‌ها" className="border-b border-line-soft bg-bg">
          <ul className="mx-auto flex max-w-7xl snap-x overflow-x-auto px-4 scrollbar-none sm:px-6 lg:px-8">
            {categories.map((c, i) => (
              <li key={c.slug} className={`min-w-40 flex-1 shrink-0 snap-start py-5 sm:min-w-44 ${i > 0 ? "border-r border-line-soft" : ""}`}>
                <Link href={`/shop?category=${c.slug}`} className="group flex items-center justify-center gap-4 px-3">
                  {c.image ? (
                    <NextImage width={1600} height={2000} src={c.image.thumb} alt="" className="h-16 w-14 object-contain mix-blend-multiply motion-safe:transition-transform motion-safe:group-hover:scale-105 sm:h-20 sm:w-16" loading="lazy" />
                  ) : null}
                  <span className="flex flex-col gap-1">
                    <span className="text-[17px] font-medium">{home.categoryLabels[c.slug] ?? c.name}</span>
                    <Icon name="arrow" className="size-4.5 transition-transform group-hover:-translate-x-1" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

/** Break after the Persian comma like the approved composition («خوش‌پوش،» / «به سبک خودت»). */
function HeroTitle({ text }: { text: string }) {
  const index = text.indexOf("،");
  if (index < 0) return <>{text}</>;
  return (
    <>
      <span className="block">{text.slice(0, index + 1)}</span>
      <span className="block">{text.slice(index + 1).trim()}</span>
    </>
  );
}
