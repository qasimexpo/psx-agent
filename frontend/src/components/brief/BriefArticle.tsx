import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Newspaper } from "lucide-react";
import type { BriefRow } from "@/lib/db";
import { changeClass, longDate, money, percent } from "@/lib/format";
import { Disclaimer, SymbolLink } from "@/components/ui/Primitives";
import GoogleAd from "@/components/GoogleAd";
import { AD_SLOT_ARTICLE } from "@/lib/adsense";
import { ogImages, ogUrl } from "@/lib/og";
import { briefPath } from "@/lib/briefs";
import { EDITOR, SITE_URL } from "@/lib/site";

/**
 * One brief, rendered the same way whichever edition it is. The closing and
 * morning pages are thin wrappers around this component.
 */

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

export function briefMetadata(brief: BriefRow, canonicalPath: string): Metadata {
  const images = ogImages({ type: "brief", date: brief.brief_date });
  return {
    // Headlines already run to 60 characters; the brand suffix would push
    // every one past the cutoff, and the publisher is in the schema anyway.
    title: { absolute: brief.headline },
    description: snippet(brief.summary),
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: brief.headline,
      description: snippet(brief.summary),
      url: `${SITE_URL}${canonicalPath}`,
      type: "article",
      publishedTime: brief.updated_at ?? brief.brief_date,
      images,
    },
    twitter: { card: "summary_large_image", images },
  };
}

export default function BriefArticle({
  brief,
  canonicalPath,
  sibling,
}: {
  brief: BriefRow;
  canonicalPath: string;
  /** The day's other edition, when it exists. */
  sibling: BriefRow | null;
}) {
  const url = `${SITE_URL}${canonicalPath}`;
  const isMorning = brief.session === "morning";

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
    // The text is generated, so the organisation is the author and a named
    // person is the editor answerable for it. Claiming a human author or a
    // per-article review would not be true.
    author: { "@type": "Organization", name: "SmartSarmaya", url: `${SITE_URL}/about` },
    editor: { "@type": "Person", "@id": EDITOR.id, name: EDITOR.name, url: EDITOR.url },
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "SmartSarmaya",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/images/logo-512.png` },
    },
    mainEntityOfPage: url,
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
        name: `${brief.brief_date}${isMorning ? " morning" : ""}`,
        item: url,
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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All briefs
        </Link>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="badge badge-halal">
            <Newspaper className="h-3 w-3" aria-hidden />
            {isMorning ? "Morning brief" : "Closing brief"}
          </span>
          <time dateTime={published}>{longDate(brief.brief_date)}</time>
          <span>
            Written by AI · Editor{" "}
            <Link href={EDITOR.url} className="font-semibold text-navy-900 hover:text-emerald-700">
              {EDITOR.name}
            </Link>
          </span>
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

        {sibling ? (
          <p className="mt-6 text-sm text-slate-600">
            {sibling.session === "morning" ? "Read the morning brief" : "Read the closing brief"}{" "}
            for the same day:{" "}
            <Link
              href={briefPath(sibling)}
              className="font-semibold text-emerald-700 hover:text-emerald-800"
            >
              {sibling.headline}
            </Link>
          </p>
        ) : null}

        <GoogleAd slot={AD_SLOT_ARTICLE} className="mt-8" />

        <Disclaimer className="mt-8 border-t border-slate-200 pt-5" />
      </div>
    </article>
  );
}
