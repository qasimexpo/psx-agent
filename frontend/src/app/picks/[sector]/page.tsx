import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import PicksSection, { type PicksBundle } from "@/components/picks/PicksSection";
import { Disclaimer } from "@/components/ui/Primitives";
import GoogleAd from "@/components/GoogleAd";
import { AD_SLOT_ARTICLE } from "@/lib/adsense";
import { ogImages } from "@/lib/og";
import { getTickerQuotes, getTopPicks } from "@/lib/db";
import { PICK_SECTORS, SECTOR_ALL, SECTOR_NAMES, sectorBySlug } from "@/lib/sectors";
import { SITE_URL } from "@/lib/site";

/**
 * One page per sector. These target the searches people actually type, such as
 * "halal cement stocks in Pakistan", and they keep the home page static.
 */
export const revalidate = 600;

export function generateStaticParams() {
  return PICK_SECTORS.map((sector) => ({ sector: sector.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sector: string }>;
}): Promise<Metadata> {
  const { sector: slug } = await params;
  const sector = sectorBySlug(slug);
  if (!sector) return { title: "Halal picks" };

  return {
    title: `Halal ${sector.title.toLowerCase()} on the PSX`,
    description: `Shariah-compliant ${sector.title.toLowerCase()} on the Pakistan Stock Exchange, screened against the KMI All Shares Islamic Index and ranked by AI for short, medium and long term horizons.`,
    alternates: { canonical: `/picks/${sector.slug}` },
    openGraph: {
      title: `Halal ${sector.title.toLowerCase()} on the PSX`,
      description: sector.blurb,
      url: `${SITE_URL}/picks/${sector.slug}`,
      type: "website",
      images: ogImages({ type: "picks", sector: sector.slug }),
    },
    twitter: {
      card: "summary_large_image",
      images: ogImages({ type: "picks", sector: sector.slug }),
    },
  };
}

export default async function SectorPicksPage({
  params,
}: {
  params: Promise<{ sector: string }>;
}) {
  const { sector: slug } = await params;
  const sector = sectorBySlug(slug);
  if (!sector) notFound();

  const [daily, monthly, yearly, quotes] = await Promise.all([
    getTopPicks("daily", sector.name),
    getTopPicks("monthly", sector.name),
    getTopPicks("yearly", sector.name),
    getTickerQuotes(60),
  ]);

  const bundle: PicksBundle = {
    daily: daily.picks,
    monthly: monthly.picks,
    yearly: yearly.picks,
  };

  const livePrices: Record<string, number> = {};
  for (const quote of quotes) livePrices[quote.symbol] = quote.current_price;

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Halal picks", item: `${SITE_URL}/picks` },
      {
        "@type": "ListItem",
        position: 3,
        name: sector.title,
        item: `${SITE_URL}/picks/${sector.slug}`,
      },
    ],
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <header className="panel-dark px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-emerald-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Home
          </Link>
          <span className="badge badge-on-dark mt-4 flex w-fit">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            KMI All Shares Islamic Index
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Halal {sector.title.toLowerCase()}
          </h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-300">{sector.blurb}</p>
        </div>
      </header>

      <PicksSection
        bundle={bundle}
        sectors={[SECTOR_ALL, ...SECTOR_NAMES]}
        activeSector={sector.name}
        pickDate={daily.pickDate ?? monthly.pickDate ?? yearly.pickDate}
        livePrices={livePrices}
      />

      <section className="px-4 pb-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="card p-5">
            <h2 className="text-base font-bold text-navy-900">
              How these {sector.title.toLowerCase()} are screened
            </h2>
            <p className="mt-2 leading-relaxed text-slate-700">
              Only companies the Pakistan Stock Exchange lists in the KMI All Shares Islamic Index
              are considered, so compliance is decided by the exchange rather than by a language
              model. Candidates are then ranked by liquidity, and each one carries its live price,
              RSI, moving averages and 52-week position before the AI sees it. The AI orders them
              and writes the reasoning. It never sets a price, and any company it invents is thrown
              away.
            </p>
            <Link
              href="/track-record"
              className="mt-4 inline-flex rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-emerald-300"
            >
              See how past picks performed
            </Link>
          </div>

          <GoogleAd slot={AD_SLOT_ARTICLE} className="mt-6" />

          <Disclaimer className="mt-6" />
        </div>
      </section>
    </div>
  );
}
