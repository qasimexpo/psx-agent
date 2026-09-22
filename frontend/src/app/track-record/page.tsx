import type { Metadata } from "next";
import Link from "next/link";
import { getScorecard, getTrackedPicks } from "@/lib/db";
import { changeClass, money, percent, shortDate } from "@/lib/format";
import { Disclaimer, EmptyState, SectionHeading, StatTile, SymbolLink } from "@/components/ui/Primitives";
import { EDITOR, SITE_URL } from "@/lib/site";

/**
 * The public scorecard. Publishing how the picks actually performed, including
 * the losers, is the thing that separates this from every other tip site.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: "Track record of our AI Shariah-compliant picks",
  description:
    "Every AI stock pick SmartSarmaya has published for the Pakistan Stock Exchange, with its entry price and current return. The good and the bad, updated daily.",
  alternates: { canonical: "/track-record" },
};

const HORIZON_LABEL: Record<string, string> = {
  daily: "Short term",
  monthly: "Medium term",
  yearly: "Long term",
};

export default async function TrackRecordPage() {
  const [scorecard, picks] = await Promise.all([getScorecard(), getTrackedPicks(80)]);

  // The scorecard is a dataset in the plain sense: one row per pick, marked
  // to market. Describing it as one lets search and answer engines cite the
  // numbers rather than paraphrase them.
  const entryDates = picks.map((pick) => pick.entry_date).filter(Boolean).sort();
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "SmartSarmaya Shariah-compliant stock pick track record",
    description:
      "Every AI-generated Shariah-compliant stock pick published by SmartSarmaya for the Pakistan Stock Exchange, with entry date, entry price, latest price and return, marked to market every trading day.",
    url: `${SITE_URL}/track-record`,
    license: `${SITE_URL}/terms-of-service`,
    isAccessibleForFree: true,
    creator: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "SmartSarmaya" },
    maintainer: { "@type": "Person", "@id": EDITOR.id, name: EDITOR.name },
    ...(entryDates.length
      ? { temporalCoverage: `${entryDates[0]}/${entryDates[entryDates.length - 1]}` }
      : {}),
    spatialCoverage: { "@type": "Place", name: "Pakistan Stock Exchange" },
    variableMeasured: [
      "entry price (PKR)",
      "latest price (PKR)",
      "return since pick (%)",
      "days held",
      "target reached",
    ],
    keywords: ["PSX", "Shariah compliant stocks", "KMI All Shares Islamic Index", "stock picks", "track record"],
  };

  return (
    <div className="px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }}
      />
      <div className="mx-auto max-w-5xl">
        <SectionHeading
          as="h1"
          eyebrow="Updated every trading day"
          title="Our track record"
          description="Every pick we publish is recorded with the price at the time and marked to market from then on. Nothing is removed when it goes wrong."
        />

        {scorecard.total > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Picks tracked" value={String(scorecard.total)} />
              <StatTile
                label="Currently in profit"
                value={`${scorecard.hit_rate}%`}
                hint={`${scorecard.winners} of ${scorecard.total}`}
                tone={scorecard.hit_rate >= 50 ? "positive" : "negative"}
              />
              <StatTile
                label="Average return"
                value={percent(scorecard.avg_return)}
                tone={scorecard.avg_return >= 0 ? "positive" : "negative"}
              />
              <StatTile
                label="Reached target"
                value={String(scorecard.targets_hit)}
                hint="Hit the exit level"
              />
            </div>

            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              <strong>How to read this.</strong> Returns are measured from the price at the moment
              the pick was published to the latest price, with no allowance for brokerage or taxes.
              A short sample proves very little. Past performance says nothing about future results.
            </p>

            <div className="card mt-5 overflow-hidden">
              <div className="table-scroll">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5">Symbol</th>
                      <th className="px-4 py-2.5">Horizon</th>
                      <th className="px-4 py-2.5">Picked</th>
                      <th className="px-4 py-2.5 text-right">Entry</th>
                      <th className="px-4 py-2.5 text-right">Latest</th>
                      <th className="px-4 py-2.5 text-right">Return</th>
                      <th className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {picks.map((pick, index) => (
                      <tr
                        key={`${pick.symbol}-${pick.timeframe}-${pick.entry_date}-${index}`}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-2.5">
                          <SymbolLink symbol={pick.symbol} />
                          <p className="max-w-[12rem] truncate text-xs text-slate-500">
                            {pick.sector}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {HORIZON_LABEL[pick.timeframe] ?? pick.timeframe}
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-2.5 text-slate-600">
                          {shortDate(pick.entry_date)}
                          <span className="block text-xs text-slate-500">
                            {pick.days_held} days
                          </span>
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-slate-700">
                          {money(pick.entry_price)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right font-semibold text-navy-900">
                          {money(pick.last_price)}
                        </td>
                        <td
                          className={`tabular px-4 py-2.5 text-right font-bold ${changeClass(pick.return_pct)}`}
                        >
                          {percent(pick.return_pct)}
                        </td>
                        <td className="px-4 py-2.5">
                          {pick.hit_target ? (
                            <span className="badge badge-halal">Target reached</span>
                          ) : (
                            <span className="badge badge-neutral">Open</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="The record starts once picks are published"
            description="Each pick is written down with the price at the time it was made, then marked to market every day. Nothing is shown here until there is something real to show."
          />
        )}

        <div className="mt-8 card p-5">
          <h2 className="text-base font-bold text-navy-900">How the picks are made</h2>
          <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>
              <strong className="text-navy-900">1. The universe is filtered first.</strong>{" "}
              Candidates must be constituents of the KMI All Shares Islamic Index published by the
              Pakistan Stock Exchange. The model never decides what is Shariah compliant.
            </li>
            <li>
              <strong className="text-navy-900">2. Real numbers are attached.</strong> Each
              candidate carries its live price, RSI, moving averages, 52-week position and volume,
              computed from five years of exchange closing prices.
            </li>
            <li>
              <strong className="text-navy-900">3. The model only ranks and explains.</strong> It
              chooses among the supplied candidates and writes the reasoning. Any ticker it invents
              is discarded before anything is saved.
            </li>
            <li>
              <strong className="text-navy-900">4. Prices come from the database.</strong> Entry
              prices, buy zones and targets are calculated in code, so a hallucinated number cannot
              reach this page.
            </li>
            <li>
              <strong className="text-navy-900">5. Everything is recorded.</strong> Each pick is
              logged the day it is made and tracked from there, whatever happens next.
            </li>
          </ol>
          <Link
            href="/#picks"
            className="mt-4 inline-flex rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            See today&apos;s picks
          </Link>
        </div>

        <Disclaimer className="mt-8" />
      </div>
    </div>
  );
}
