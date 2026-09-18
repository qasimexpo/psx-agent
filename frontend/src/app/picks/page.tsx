import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import GoogleAd from "@/components/GoogleAd";
import { Disclaimer } from "@/components/ui/Primitives";
import { getTopPicks } from "@/lib/db";
import { AD_SLOT_ARTICLE } from "@/lib/adsense";
import { ogImages } from "@/lib/og";
import { PICK_SECTORS } from "@/lib/sectors";
import { SITE_URL } from "@/lib/site";

/**
 * The hub above the ten sector pages.
 *
 * `/picks/cement` existed while `/picks` was a 404, which left the sector
 * pages without a parent. A hub gives them one, gives the crawler a single
 * page that links to all of them, and targets "halal stocks Pakistan" head-on
 * rather than leaving that query to the home page.
 */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Halal stocks in Pakistan, by sector",
  description:
    "Shariah-compliant stock picks for ten PSX sectors, screened against the KMI All Shares Islamic Index published by the Pakistan Stock Exchange and ranked by AI for short, medium and long term horizons.",
  alternates: { canonical: "/picks" },
  openGraph: {
    title: "Halal stocks in Pakistan, by sector",
    description:
      "Ten sectors of Shariah-compliant PSX stocks, screened against the exchange's own Islamic index.",
    url: `${SITE_URL}/picks`,
    type: "website",
    images: ogImages({ type: "site" }),
  },
  twitter: { card: "summary_large_image", images: ogImages({ type: "site" }) },
};

export default async function PicksHubPage() {
  // One query per sector, all in flight together. Each is an indexed read of a
  // single row, so the page still costs one round trip's worth of latency.
  const results = await Promise.all(
    PICK_SECTORS.map((sector) => getTopPicks("daily", sector.name, 3)),
  );

  const sectors = PICK_SECTORS.map((sector, index) => ({
    ...sector,
    picks: results[index].picks,
    pickDate: results[index].pickDate,
  }));

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Halal picks", item: `${SITE_URL}/picks` },
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Halal stock picks by PSX sector",
    itemListElement: sectors.map((sector, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: sector.title,
      url: `${SITE_URL}/picks/${sector.slug}`,
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <header className="panel-dark px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <span className="badge badge-halal">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            KMI All Shares screened
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Halal stocks in Pakistan, by sector
          </h1>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">
            Every company below is a constituent of the KMI All Shares Islamic Index published by
            the Pakistan Stock Exchange. Compliance is decided by the exchange, not by a language
            model. The AI only ranks what has already passed that screen, and every pick it makes
            is recorded at the published price and marked to market daily.
          </p>
        </div>
      </header>

      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sectors.map((sector) => (
              <Link
                key={sector.slug}
                href={`/picks/${sector.slug}`}
                className="card flex flex-col p-5 transition hover:border-emerald-300"
              >
                <h2 className="text-base font-bold text-navy-900">{sector.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  {sector.blurb}
                </p>

                {sector.picks.length ? (
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {sector.picks.slice(0, 3).map((pick) => (
                      <li
                        key={pick.symbol}
                        className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                      >
                        {pick.symbol}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-xs text-slate-500">
                    Ranked every trading morning.
                  </p>
                )}

                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                  See {sector.title.toLowerCase()}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            ))}
          </div>

          <div className="card mt-6 p-5">
            <h2 className="text-base font-bold text-navy-900">
              How a stock qualifies as halal here
            </h2>
            <p className="mt-2 leading-relaxed text-slate-700">
              A stock appears on these pages only if the Pakistan Stock Exchange lists it in the
              KMI All Shares Islamic Index. That index applies the business-activity and financial
              ratio screens on the exchange&apos;s behalf, and it is reviewed periodically. Asking
              an AI whether a company is Shariah compliant produces a confident answer that is
              wrong often enough to matter, so it is never asked. It receives a screened list with
              live prices and technical levels attached, ranks it, and explains the ranking.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/track-record"
                className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                See how past picks performed
              </Link>
              <Link
                href="/stocks"
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-emerald-300"
              >
                Browse every listed stock
              </Link>
            </div>
          </div>

          <GoogleAd slot={AD_SLOT_ARTICLE} className="mt-6" />

          <Disclaimer className="mt-6" />
        </div>
      </section>
    </div>
  );
}
