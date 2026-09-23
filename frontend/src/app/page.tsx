import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Hero from "@/components/Hero";
import BriefCard from "@/components/brief/BriefCard";
import { EventsSection, NewsSection } from "@/components/events/EventsAndNews";
import { IndexCard, Ticker } from "@/components/market/MarketStrip";
import Movers from "@/components/market/Movers";
import PicksSection, { type PicksBundle } from "@/components/picks/PicksSection";
import NewsletterSignup from "@/components/tools/NewsletterSignup";
import PortfolioAudit from "@/components/tools/PortfolioAudit";
import StockAnalyzer from "@/components/tools/StockAnalyzer";
import { Disclaimer } from "@/components/ui/Primitives";
import GoogleAd from "@/components/GoogleAd";
import { AD_SLOT_BOTTOM, AD_SLOT_TOP } from "@/lib/adsense";
import { SECTOR_ALL, SECTOR_NAMES } from "@/lib/sectors";
import {
  getIndexSnapshot,
  getLatestBrief,
  getMarketStats,
  getMovers,
  getNews,
  getScorecard,
  getSectorStats,
  getTickerQuotes,
  getTopPicks,
  getUpcomingEvents,
  getUpcomingPayouts,
  isDatabaseConfigured,
  type Pick,
} from "@/lib/db";

/**
 * The home page is a server component. Every section below is rendered from the
 * database into the HTML, which is what makes the content visible to search
 * engines and to the AdSense reviewer. The page refreshes on a five minute
 * timer rather than on every request.
 */
export const revalidate = 300;

// Sector filtering lives at /picks/[sector] rather than in a query parameter,
// which keeps this page statically rendered and gives each sector a page search
// engines can index.
const SECTORS = [SECTOR_ALL, ...SECTOR_NAMES];

export default async function Page() {
  const sector = SECTOR_ALL;

  if (!isDatabaseConfigured()) {
    return <SetupNotice />;
  }

  const [
    quotes,
    index,
    stats,
    brief,
    scorecard,
    daily,
    monthly,
    yearly,
    gainers,
    losers,
    mostActive,
    sectors,
    payouts,
    events,
    pakistanNews,
    globalNews,
  ] = await Promise.all([
    getTickerQuotes(30),
    getIndexSnapshot(),
    getMarketStats(),
    getLatestBrief(),
    getScorecard(),
    getTopPicks("daily", sector),
    getTopPicks("monthly", sector),
    getTopPicks("yearly", sector),
    getMovers("gainers", 5),
    getMovers("losers", 5),
    getMovers("most_active", 5),
    getSectorStats(6),
    getUpcomingPayouts(12),
    getUpcomingEvents(12),
    getNews("pakistan", 5),
    getNews("global", 5),
  ]);

  const bundle: PicksBundle = {
    daily: daily.picks,
    monthly: monthly.picks,
    yearly: yearly.picks,
  };

  // Live prices let each card show how the pick has done since it was made.
  const livePrices: Record<string, number> = {};
  for (const quote of quotes) livePrices[quote.symbol] = quote.current_price;
  for (const list of [gainers, losers, mostActive]) {
    for (const mover of list) livePrices[mover.symbol] = mover.price;
  }

  const allPicks: Pick[] = [...bundle.daily, ...bundle.monthly, ...bundle.yearly];

  return (
    <>
      <Hero
        scorecard={scorecard}
        halalCount={stats.halal}
        index={index}
        picks={allPicks}
        quotes={quotes}
      />
      <Ticker quotes={quotes} />

      <section className="px-4 pt-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <IndexCard
            index={index}
            halalCount={stats.halal}
            totalCount={stats.total}
            updatedAt={stats.updatedAt}
          />
        </div>
      </section>

      <BriefCard brief={brief} />

      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-md">
              <h2 className="text-xl font-bold tracking-tight text-navy-900">
                The brief, in your inbox
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                The market brief and the week&apos;s book closures, once per trading day.
                Written from exchange data, same as the site.
              </p>
            </div>
            <NewsletterSignup source="home" compact className="w-full sm:max-w-sm" />
          </div>
        </div>
      </section>

      <PortfolioAudit />

      <section className="px-4 py-2 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <GoogleAd slot={AD_SLOT_TOP} />
        </div>
      </section>

      <PicksSection
        bundle={bundle}
        sectors={SECTORS}
        activeSector={sector}
        pickDate={daily.pickDate ?? monthly.pickDate ?? yearly.pickDate}
        livePrices={livePrices}
      />

      {allPicks.length ? (
        <section className="px-4 pb-4 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Link
              href="/track-record"
              className="card card-hover flex items-center justify-between gap-4 p-4"
            >
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-navy-900">
                  We publish how these picks perform.
                </span>{" "}
                {scorecard.total > 0
                  ? `${scorecard.total} picks tracked so far, ${scorecard.hit_rate}% currently in profit.`
                  : "The track record builds as picks are made."}
              </p>
              <ArrowRight className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            </Link>
          </div>
        </section>
      ) : null}

      <StockAnalyzer />

      <Movers gainers={gainers} losers={losers} mostActive={mostActive} sectors={sectors} />

      <EventsSection payouts={payouts} events={events} />

      <NewsSection pakistan={pakistanNews} global={globalNews} />

      <section className="px-4 pb-10 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <GoogleAd slot={AD_SLOT_BOTTOM} />
          <Disclaimer />
        </div>
      </section>
    </>
  );
}

function SetupNotice() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="card mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold text-navy-900">SmartSarmaya is not configured yet</h1>
        <p className="mt-3 leading-relaxed text-slate-600">
          The site reads market data from a Neon Postgres database that the pipeline fills. Set the{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">DATABASE_URL</code>{" "}
          environment variable, then run the pipeline once to populate it.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-navy-900 p-4 text-xs leading-relaxed text-slate-200">
{`pip install -r requirements.txt
python -m pipeline.run bootstrap`}
        </pre>
        <p className="mt-4 text-sm text-slate-500">
          Full instructions are in the repository README.
        </p>
      </div>
    </section>
  );
}
