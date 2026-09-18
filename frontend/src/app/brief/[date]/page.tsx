import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Newspaper } from "lucide-react";
import { getBriefByDate, listBriefs } from "@/lib/db";
import { changeClass, longDate, money, percent } from "@/lib/format";
import { Disclaimer, SymbolLink } from "@/components/ui/Primitives";
import GoogleAd from "@/components/GoogleAd";
import { AD_SLOT_ARTICLE } from "@/lib/adsense";
import { ogImages, ogUrl } from "@/lib/og";
import { SITE_URL } from "@/lib/site";

export const revalidate = 600;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The summary is a full paragraph; a result page shows about 155 characters
 * of it. Cutting at a sentence keeps the snippet readable, and the whole
 * summary is still the first thing on the page.
 */
function snippet(summary: string, limit = 155): string {
  if (summary.length <= limit) return summary;
  const head = summary.slice(0, limit);
  const sentenceEnd = head.lastIndexOf(". ");
  if (sentenceEnd > 60) return head.slice(0, sentenceEnd + 1);
  return `${head.slice(0, head.lastIndexOf(" "))}…`;
}

export async function generateStaticParams() {
  const briefs = await listBriefs(20);
  const seen = new Set<string>();
  return briefs
    .filter((brief) => {
      if (seen.has(brief.brief_date)) return false;
      seen.add(brief.brief_date);
      return true;
    })
    .map((brief) => ({ date: brief.brief_date }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) return { title: "Market brief" };

  const brief = await getBriefByDate(date);
  if (!brief) return { title: `PSX market brief for ${date}` };

  return {
    // Headlines already run to 60 characters; the brand suffix would push
    // every one past the cutoff, and the publisher is in the schema anyway.
    title: { absolute: brief.headline },
    description: snippet(brief.summary),
    alternates: { canonical: `/brief/${date}` },
    openGraph: {
      title: brief.headline,
      description: snippet(brief.summary),
      url: `${SITE_URL}/brief/${date}`,
      type: "article",
      publishedTime: brief.updated_at ?? date,
      images: ogImages({ type: "brief", date }),
    },
    twitter: {
      card: "summary_large_image",
      images: ogImages({ type: "brief", date }),
    },
  };
}

export default async function BriefPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) notFound();

  const brief = await getBriefByDate(date);
  if (!brief) notFound();

  // Article rich results need an image and full timestamps; a bare date and
  // no image kept these out of Top Stories entirely. The share card the
  // pipeline already renders for social doubles as the article image.
  const published = brief.updated_at ?? brief.brief_date;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: brief.headline,
    description: brief.summary,
    image: [ogUrl({ type: "brief", date: brief.brief_date })],
    datePublished: published,
    dateModified: published,
    author: { "@type": "Organization", name: "SmartSarmaya", url: `${SITE_URL}/about` },
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "SmartSarmaya",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/images/logo.jpg` },
    },
    mainEntityOfPage: `${SITE_URL}/brief/${brief.brief_date}`,
    isAccessibleForFree: true,
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Market brief", item: `${SITE_URL}/brief` },
      {
        "@type": "ListItem",
        position: 3,
        name: brief.brief_date,
        item: `${SITE_URL}/brief/${brief.brief_date}`,
      },
    ],
  };

  return (
    <article className="px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      <div className="mx-auto max-w-3xl">
        <Link
          href="/brief"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All briefs
        </Link>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="badge badge-halal">
            <Newspaper className="h-3 w-3" aria-hidden />
            {brief.session === "morning" ? "Morning brief" : "Closing brief"}
          </span>
          <time dateTime={brief.brief_date}>{longDate(brief.brief_date)}</time>
        </div>

        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-navy-900 sm:text-4xl">
          {brief.headline}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-700">{brief.summary}</p>

        {brief.index_value ? (
          <div className="card mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                KSE-100
              </p>
              <p className="tabular text-xl font-bold text-navy-900">
                {money(brief.index_value)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Session move
              </p>
              <p className={`tabular text-xl font-bold ${changeClass(brief.index_change_pct)}`}>
                {percent(brief.index_change_pct)}
              </p>
            </div>
          </div>
        ) : null}

        {brief.key_points.length ? (
          <div className="card mt-6 p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
              What matters
            </h2>
            <ul className="space-y-2">
              {brief.key_points.map((point, index) => (
                <li key={index} className="flex gap-2.5 leading-relaxed text-slate-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          className="brief-body mt-8 text-[15px]"
          dangerouslySetInnerHTML={{ __html: brief.body_html }}
        />

        {brief.symbols.length ? (
          <div className="mt-8 border-t border-slate-200 pt-5">
            <p className="mb-2 text-sm font-semibold text-navy-900">Stocks discussed</p>
            <div className="flex flex-wrap gap-2">
              {brief.symbols.map((symbol) => (
                <SymbolLink
                  key={symbol}
                  symbol={symbol}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm no-underline hover:border-emerald-300"
                />
              ))}
            </div>
          </div>
        ) : null}

        <GoogleAd slot={AD_SLOT_ARTICLE} className="mt-8" />

        <Disclaimer className="mt-8 border-t border-slate-200 pt-5" />
      </div>
    </article>
  );
}
