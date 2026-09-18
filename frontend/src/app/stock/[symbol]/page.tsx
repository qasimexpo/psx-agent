import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, TrendingUp } from "lucide-react";
import {
  getEventsFor,
  getStock,
  getStockNote,
  listIndexableSymbols,
  listSectorPeers,
} from "@/lib/db";
import {
  changeClass,
  compact,
  money,
  percent,
  rangePosition,
  relativeTime,
} from "@/lib/format";
import { Disclaimer, RangeBar } from "@/components/ui/Primitives";
import GoogleAd from "@/components/GoogleAd";
import { AD_SLOT_ARTICLE } from "@/lib/adsense";
import { ogImages } from "@/lib/og";
import { slugForSectorCode } from "@/lib/sectors";
import { SITE_URL } from "@/lib/site";
import { isSecondaryInstrument, parentSymbol, shortName } from "@/lib/symbols";

/**
 * One page per listed company. These are what give the site something for
 * search engines to index beyond a single landing page, and they are generated
 * entirely from data the pipeline already collects.
 */
export const revalidate = 900;

export async function generateStaticParams() {
  // Pre-render the most liquid names; the rest render on first request.
  const symbols = await listIndexableSymbols(60);
  return symbols.map((row) => ({ symbol: row.symbol }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const clean = symbol.toUpperCase();
  const stock = await getStock(clean);

  if (!stock) return { title: `${clean} share price` };

  const halal = stock.is_kmi ? "Shariah compliant" : "not Shariah compliant";
  const label = companyLabel(stock.name, clean);
  const images = ogImages({ type: "stock", symbol: clean });
  const metadata: Metadata = {
    // Absolute, because the layout's " | SmartSarmaya" suffix pushed every
    // stock title past what a result page shows. The company name leads: it
    // is what people type, and the ticker alone was all the old title had.
    title: { absolute: `${label} share price & halal status` },
    // Kept under 155 characters so the halal verdict and price both survive
    // the snippet. "Latest" rather than "live": quotes are end-of-day.
    description: `${label} is ${halal} on the PSX. Latest price ${money(stock.current_price)} PKR (${percent(stock.change_pct)}). Technicals, 52-week range and KMI index status.`,
    alternates: { canonical: `/stock/${clean}` },
    openGraph: {
      title: `${label} share price and analysis`,
      description: `PSX price, technical position and Shariah status for ${stock.name}.`,
      url: `${SITE_URL}/stock/${clean}`,
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", images },
  };

  // Ex-entitlement tickers are the parent share for a few days; rights and
  // preference listings are thin copies of the ordinary share's template.
  // Neither should compete with the company page in search.
  const parent = parentSymbol(clean, stock.name);
  if (parent) {
    return (await getStock(parent))
      ? { ...metadata, alternates: { canonical: `/stock/${parent}` } }
      : { ...metadata, robots: { index: false, follow: true } };
  }
  if (isSecondaryInstrument(stock.name)) {
    return { ...metadata, robots: { index: false, follow: true } };
  }
  return metadata;
}

/** "Pakistan Petroleum (PPL)", or just the ticker when the feed has no name. */
function companyLabel(name: string, symbol: string): string {
  const short = shortName(name);
  return short && short !== symbol ? `${short} (${symbol})` : symbol;
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean) notFound();

  const stock = await getStock(clean);
  if (!stock) notFound();

  const parentTicker = parentSymbol(clean, stock.name);
  const [note, events, peers, parent] = await Promise.all([
    getStockNote(clean),
    getEventsFor([clean]),
    listSectorPeers(clean, stock.sector_code, 8),
    parentTicker ? getStock(parentTicker) : null,
  ]);
  const position = rangePosition(stock.current_price, stock.low_52w, stock.high_52w);
  const symbolEvents = events[clean] ?? [];
  const sectorSlug = slugForSectorCode(stock.sector_code, stock.is_kmi);
  const hasName = stock.name !== clean;

  // The listed company itself, which is the entity a search engine can tie
  // this page to. FinancialProduct, used before, describes loans and
  // accounts and nothing consumed it.
  const schema = {
    "@context": "https://schema.org",
    "@type": "Corporation",
    name: stock.name,
    tickerSymbol: clean,
    url: `${SITE_URL}/stock/${clean}`,
    sameAs: `https://dps.psx.com.pk/company/${clean}`,
    description: note?.overview || `${stock.name} share price and technical position on the PSX.`,
    ...(note ? { dateModified: note.updated_at } : {}),
  };

  // Breadcrumbs give Google the site hierarchy and win the breadcrumb trail
  // in the result snippet, which lifts click-through on long-tail queries.
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Stocks", item: `${SITE_URL}/stocks` },
      { "@type": "ListItem", position: 3, name: clean, item: `${SITE_URL}/stock/${clean}` },
    ],
  };

  const metrics: [string, string][] = [
    ["Open", money(stock.open)],
    ["Day high", money(stock.high)],
    ["Day low", money(stock.low)],
    ["Previous close", money(stock.ldcp)],
    ["Volume", compact(stock.volume)],
    ["30-day average volume", compact(stock.avg_volume_30d)],
  ];

  const technicals: [string, string][] = [
    ["RSI (14)", stock.rsi_14 === null ? "—" : String(stock.rsi_14)],
    ["20-day average", money(stock.sma_20)],
    ["50-day average", money(stock.sma_50)],
    ["200-day average", money(stock.sma_200)],
    ["Support", money(stock.support)],
    ["Resistance", money(stock.resistance)],
    ["Daily volatility", stock.volatility_pct === null ? "—" : `${stock.volatility_pct}%`],
  ];

  const performance: [string, number | null][] = [
    ["1 week", stock.change_1w_pct],
    ["1 month", stock.change_1m_pct],
    ["3 months", stock.change_3m_pct],
    ["1 year", stock.change_1y_pct],
  ];

  return (
    <div className="px-4 py-10 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      <div className="mx-auto max-w-5xl">
        <Link
          href="/stocks"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All stocks
        </Link>

        <header className="card mt-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {/* The company name is what people search for, so it belongs in
                  the H1 rather than in a paragraph under a bare ticker. */}
              <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">
                {hasName ? (
                  <>
                    {stock.name} <span className="font-semibold text-slate-500">({clean})</span>
                  </>
                ) : (
                  clean
                )}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {stock.is_kmi ? (
                  <span className="badge badge-halal">
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    Shariah compliant
                  </span>
                ) : (
                  <span className="badge badge-neutral">Not KMI listed</span>
                )}
                {stock.is_kse100 ? <span className="badge badge-neutral">KSE-100</span> : null}
                {stock.is_kmi30 ? <span className="badge badge-neutral">KMI-30</span> : null}
              </div>
              <p className="mt-2 text-sm text-slate-500">{stock.sector_name}</p>
            </div>

            <div className="text-right">
              <p className="tabular text-3xl font-bold text-navy-900">
                {money(stock.current_price)}
              </p>
              <p className={`tabular text-sm font-semibold ${changeClass(stock.change_pct)}`}>
                {money(stock.change)} ({percent(stock.change_pct)})
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Updated {relativeTime(stock.quote_at)}
              </p>
            </div>
          </div>

          {parent ? (
            <p className="mt-4 text-sm text-slate-600">
              {clean} is the temporary ticker for {parent.name} while it trades ex-entitlement.
              The company&apos;s own page is{" "}
              <Link
                href={`/stock/${parent.symbol}`}
                className="font-semibold text-emerald-700 hover:text-emerald-800"
              >
                {parent.symbol}
              </Link>
              .
            </p>
          ) : null}

          {position !== null ? (
            <div className="mt-5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                52-week range
              </p>
              <RangeBar
                position={position}
                low={money(stock.low_52w)}
                high={money(stock.high_52w)}
              />
            </div>
          ) : null}
        </header>

        <p className="mt-4 px-1 text-[15px] leading-relaxed text-slate-700">
          <strong className="text-navy-900">
            {stock.is_kmi
              ? `Yes, ${clean} is Shariah compliant.`
              : `No, ${clean} is not Shariah compliant.`}
          </strong>{" "}
          {stock.name} {stock.is_kmi ? "is" : "is not"} a constituent of the KMI All Shares
          Islamic Index published by the Pakistan Stock Exchange. It last traded at{" "}
          {money(stock.current_price)} PKR, {stock.change_pct >= 0 ? "up" : "down"}{" "}
          {percent(Math.abs(stock.change_pct))} on the day, in the {stock.sector_name} sector.
        </p>

        {note ? (
          <section className="card mt-4 p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">AI analysis</h2>
              <span className="badge badge-neutral">{note.verdict}</span>
              <span className="text-xs text-slate-500">
                Refreshed {relativeTime(note.updated_at)}
              </span>
            </div>
            {note.headline ? (
              <p className="mb-2 font-semibold text-navy-900">{note.headline}</p>
            ) : null}
            <p className="leading-relaxed text-slate-700">{note.overview}</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Bull case
                </p>
                <p className="text-sm leading-relaxed text-emerald-900">{note.bull_case}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-rose-700">
                  Bear case
                </p>
                <p className="text-sm leading-relaxed text-rose-900">{note.bear_case}</p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-navy-900">Today</h2>
            <table className="w-full">
              <caption className="sr-only">{clean} trading data for the latest session</caption>
              <tbody>
                {metrics.map(([label, value]) => (
                  <tr key={label} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="py-1 pr-3 text-left text-sm font-normal text-slate-500">
                      {label}
                    </th>
                    <td className="tabular py-1 text-right text-sm font-semibold text-navy-900">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-navy-900">
              <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />
              Technicals
            </h2>
            <table className="w-full">
              <caption className="sr-only">{clean} technical indicators</caption>
              <tbody>
                {technicals.map(([label, value]) => (
                  <tr key={label} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="py-1 pr-3 text-left text-sm font-normal text-slate-500">
                      {label}
                    </th>
                    <td className="tabular py-1 text-right text-sm font-semibold text-navy-900">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stock.trend ? (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">Trend: </span>
                <span className="font-semibold text-navy-900">{stock.trend}</span>
              </p>
            ) : null}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-navy-900">Performance</h2>
            <table className="w-full">
              <caption className="sr-only">{clean} price change by period</caption>
              <tbody>
                {performance.map(([label, value]) => (
                  <tr key={label} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="py-1 pr-3 text-left text-sm font-normal text-slate-500">
                      {label}
                    </th>
                    <td className={`tabular py-1 text-right text-sm font-semibold ${changeClass(value)}`}>
                      {percent(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {symbolEvents.length ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Upcoming
                </p>
                <ul className="space-y-1">
                  {symbolEvents.map((event, index) => (
                    <li key={index} className="text-sm text-amber-800">
                      {event}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>

        <section className="card mt-4 p-5">
          <h2 className="text-base font-bold text-navy-900">
            Is {clean} halal to invest in?
          </h2>
          <p className="mt-2 leading-relaxed text-slate-700">
            {stock.is_kmi ? (
              <>
                {stock.name}{" "}
                is a constituent of the KMI All Shares Islamic Index, the Shariah-screened index
                published by the Pakistan Stock Exchange. On that basis it passes the
                exchange&apos;s Shariah screen. Index membership is reviewed periodically, and this
                page reflects the latest published list.
              </>
            ) : (
              <>
                {stock.name}{" "}
                is not currently a constituent of the KMI All Shares Islamic Index, so it does not
                pass the Pakistan Stock Exchange&apos;s Shariah screen. That usually reflects the
                company&apos;s business activity or its debt and interest income ratios.
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            This is a description of index membership, not a religious ruling. Consult a qualified
            scholar for guidance on your own circumstances.
          </p>
        </section>

        {peers.length ? (
          <section className="card mt-4 p-5">
            <h2 className="text-base font-bold text-navy-900">
              Other {stock.sector_name || "PSX"} stocks
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {peers.map((peer) => (
                <li key={peer.symbol}>
                  <Link
                    href={`/stock/${peer.symbol}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm transition hover:border-emerald-300"
                  >
                    <span className="font-semibold text-navy-900">{peer.symbol}</span>
                    <span className={`tabular text-xs ${changeClass(peer.change_pct)}`}>
                      {percent(peer.change_pct)}
                    </span>
                    {peer.is_kmi ? (
                      <span className="text-xs text-emerald-700">halal</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
            {sectorSlug ? (
              <Link
                href={`/picks/${sectorSlug}`}
                className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                See the halal picks for this sector
              </Link>
            ) : null}
          </section>
        ) : null}

        <GoogleAd slot={AD_SLOT_ARTICLE} className="mt-6" />

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/#audit"
            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Audit a portfolio holding {clean}
          </Link>
          <Link
            href="/#picks"
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-emerald-300"
          >
            See today&apos;s halal picks
          </Link>
        </div>

        <Disclaimer className="mt-8 border-t border-slate-200 pt-5" />
      </div>
    </div>
  );
}
