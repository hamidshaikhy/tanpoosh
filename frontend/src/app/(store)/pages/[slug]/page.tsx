import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SizeTable } from "@/components/product/SizeGuide";
import { SupportForm } from "@/components/support/SupportForm";
import { ErrorBlock, Notice } from "@/components/ui/States";
import { checkout, common, sizeGuide, support } from "@/content/fa";
import { getPage, getSettings } from "@/lib/api/public";
import type { InfoPage, PublicSettings } from "@/lib/api/types";
import { shortToman, toman } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug).catch(() => null);
  return page ? { title: page.title, description: page.summary, alternates: { canonical: `/pages/${slug}` } } : { title: "صفحه" };
}

export default async function InfoPageView({ params }: Props) {
  const { slug } = await params;
  let page: InfoPage | null;
  let settings: PublicSettings | null = null;
  try {
    [page, settings] = await Promise.all([getPage(slug), getSettings().catch(() => null)]);
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorBlock message={common.serverDown} />
      </div>
    );
  }
  if (!page) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 pt-10 pb-20 sm:px-6">
      <h1 className="text-3xl font-bold">{page.title}</h1>
      {page.summary ? <p className="mt-3 text-lg text-ink-soft">{page.summary}</p> : null}
      <div className="mt-8 flex flex-col gap-5 leading-8">
        {page.blocks.map((b, i) => {
          if (b.type === "heading") return <h2 key={i} className="mt-4 text-xl font-semibold">{b.text}</h2>;
          if (b.type === "list")
            return (
              <ul key={i} className="flex list-disc flex-col gap-2 ps-6 text-ink-soft marker:text-muted">
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          if (b.type === "note") return <Notice key={i}>{b.text}</Notice>;
          return (
            <p key={i} className="whitespace-pre-line text-ink-soft">
              {b.text}
            </p>
          );
        })}
      </div>

      {slug === "shipping" && settings ? (
        <section className="mt-10" aria-labelledby="live-shipping">
          <h2 id="live-shipping" className="mb-4 text-xl font-semibold">
            روش‌های ارسال فعال
          </h2>
          <ul className="divide-y divide-line-soft border-y border-line-soft">
            {settings.shipping_methods.map((m) => (
              <li key={m.code} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-ink-soft">{m.eta_text}</p>
                  <p className="text-xs text-muted">{m.free_threshold_toman !== null ? checkout.freeOver(shortToman(m.free_threshold_toman)) : checkout.neverFree}</p>
                </div>
                <p className="num">{toman(m.fee_toman)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {slug === "size-guide" ? (
        <section className="mt-10 flex flex-col gap-10">
          <SizeTable chart="tops" />
          <SizeTable chart="bottoms" />
          <SizeTable chart="shoes" />
          <p className="text-xs text-muted">{sizeGuide.note}</p>
        </section>
      ) : null}

      {slug === "contact" ? (
        <section className="mt-10 flex flex-col gap-8">
          {settings && (settings.contact.email || settings.contact.phone || settings.contact.address) ? (
            <dl className="grid gap-3 border border-line bg-elevated p-5 text-sm sm:grid-cols-2">
              {settings.contact.phone ? (
                <div>
                  <dt className="text-muted">تلفن</dt>
                  <dd className="ltr text-start">{settings.contact.phone}</dd>
                </div>
              ) : null}
              {settings.contact.email ? (
                <div>
                  <dt className="text-muted">ایمیل</dt>
                  <dd className="ltr text-start">{settings.contact.email}</dd>
                </div>
              ) : null}
              {settings.contact.hours ? (
                <div>
                  <dt className="text-muted">ساعات پاسخگویی</dt>
                  <dd>{settings.contact.hours}</dd>
                </div>
              ) : null}
              {settings.contact.address ? (
                <div>
                  <dt className="text-muted">نشانی</dt>
                  <dd>{settings.contact.address}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <div className="border border-line p-5 sm:p-6">
            <h2 className="mb-5 text-xl font-semibold">{support.title}</h2>
            <SupportForm />
          </div>
        </section>
      ) : null}

      {page.is_seed_content ? <p className="mt-12 text-xs text-muted">این صفحه هنوز محتوای نمونه دارد و باید توسط مدیر فروشگاه تکمیل شود.</p> : null}
    </article>
  );
}
