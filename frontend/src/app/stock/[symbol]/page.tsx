import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, TrendingUp } from "lucide-react";
import {
  getEventsFor,
  getStock,
  getStockNote,
  listIndexableSymbols,
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
import { SITE_URL } from "@/lib/site";

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
  return {
    title: `${clean} share price, technicals and Shariah status`,
    description: `${stock.name} (${clean}) trades at ${stock.current_price.toFixed(2)} PKR on the Pakistan Stock Exchange. Live price, RSI, moving averages, 52-week range and KMI Islamic index status. ${stock.name} is ${halal}.`,
    alternates: { canonical: `/stock/${clean}` },
    openGraph: {
      title: `${clean} - ${stock.name} share price and analysis`,
      description: `Live PSX price, technical position and Shariah status for ${stock.name}.`,
      url: `${SITE_URL}/stock/${clean}`,
      type: "website",
    },
  };
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

  const [note, events] = await Promise.all([getStockNote(clean), getEventsFor([clean])]);
  const position = rangePosition(stock.current_price, stock.low_52w, stock.high_52w);
  const symbolEvents = events[clean] ?? [];

  const schema = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: `${stock.name} (${clean})`,
    description: note?.overview || `${stock.name} share price and technical position on the PSX.`,
    url: `${SITE_URL}/stock/${clean}`,
    category: stock.sector_name,
    provider: { "@type": "Organization", name: "Pakistan Stock Exchange" },
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

      <div className="mx-auto max-w-5xl">
        <Link
          href="/stocks"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All stocks
        </Link>

        <header className="card mt-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">
                  {clean}
                </h1>
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
              <p className="mt-1 text-slate-600">{stock.name}</p>
              <p className="text-sm text-slate-500">{stock.sector_name}</p>
            </div>

            <div className="text-right">
              <p className="tabular text-3xl font-bold text-navy-900">
                {money(stock.current_price)}
              </p>
              <p className={`tabular text-sm font-semibold ${changeClass(stock.change_pct)}`}>
                {money(stock.change)} ({percent(stock.change_pct)})
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Updated {relativeTime(stock.quote_at)}
              </p>
            </div>
          </div>

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

        {note ? (
          <section className="card mt-4 p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">AI analysis</h2>
              <span className="badge badge-neutral">{note.verdict}</span>
              <span className="text-xs text-slate-400">
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
            <dl className="space-y-2">
              {metrics.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-slate-500">{label}</dt>
                  <dd className="tabular text-sm font-semibold text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-navy-900">
              <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />
              Technicals
            </h2>
            <dl className="space-y-2">
              {technicals.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-slate-500">{label}</dt>
                  <dd className="tabular text-sm font-semibold text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>
            {stock.trend ? (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">Trend: </span>
                <span className="font-semibold text-navy-900">{stock.trend}</span>
              </p>
            ) : null}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-navy-900">Performance</h2>
            <dl className="space-y-2">
              {performance.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-slate-500">{label}</dt>
                  <dd className={`tabular text-sm font-semibold ${changeClass(value)}`}>
                    {percent(value)}
                  </dd>
                </div>
              ))}
            </dl>

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
