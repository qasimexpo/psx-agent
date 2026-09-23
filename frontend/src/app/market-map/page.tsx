import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import MarketMap from "@/components/market/MarketMap";
import { Disclaimer, EmptyState, SectionHeading } from "@/components/ui/Primitives";
import { getIndexSnapshot, getMarketMap, isDatabaseConfigured } from "@/lib/db";
import { longDate, percent } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

/**
 * The market map: one screen that answers "what happened today" before any
 * reading. Refreshed on the same five minute timer as the home page, so it is
 * live through the session and settles into the day's record after the close.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "KSE-100 market map: today's PSX heat map by sector",
  description:
    "Every KSE-100 company as a tile, sized by the day's value traded and coloured by its move, grouped by sector. Advances, declines, volume and turnover for the session.",
  alternates: { canonical: "/market-map" },
  openGraph: {
    title: "KSE-100 market map | SmartSarmaya",
    description:
      "Today's PSX session as a sector heat map: who moved, where the money went, and how breadth looked.",
    url: `${SITE_URL}/market-map`,
  },
};

function Stat({
  label,
  value,
  sub,
  tone = "",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`tabular mt-1 text-2xl font-bold ${tone || "text-white"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{sub}</p>
    </div>
  );
}

export default async function MarketMapPage() {
  if (!isDatabaseConfigured()) {
    return (
      <section className="px-4 py-20 sm:px-6">
        <EmptyState title="Market data is not configured" description="Set DATABASE_URL and run the pipeline." />
      </section>
    );
  }

  const [map, index] = await Promise.all([getMarketMap(), getIndexSnapshot()]);
  const asOf = map.updatedAt ? new Date(map.updatedAt) : null;

  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "KSE-100 market map",
    description:
      "KSE-100 constituents with the day's price change, volume and approximate value traded, grouped by sector.",
    url: `${SITE_URL}/market-map`,
    creator: { "@type": "Organization", name: "SmartSarmaya", url: SITE_URL },
    isAccessibleForFree: true,
    temporalCoverage: asOf ? asOf.toISOString().slice(0, 10) : undefined,
    variableMeasured: ["Price change percent", "Volume", "Value traded", "Sector"],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }} />

      <section className="bg-navy-900 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
            Market view · proportional sector map
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            KSE-100 market map
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {asOf ? `Prices as of ${longDate(asOf.toISOString())}, ${asOf.toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" })} PKT` : "Waiting for the first price update"}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="KSE-100 index"
              value={index ? index.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
              sub={index ? `${percent(index.change_pct)} on the session` : "No snapshot yet"}
              tone={index ? (index.change_pct >= 0 ? "text-emerald-300" : "text-rose-300") : ""}
            />
            <Stat
              label="Advances / declines"
              value={`${map.advances} / ${map.declines}`}
              sub={`${map.unchanged} unchanged, of ${map.tiles.length} constituents that traded`}
            />
            <Stat
              label="Volume"
              value={`${(map.totalVolume / 1e6).toFixed(2)} mn`}
              sub="Shares traded across the KSE-100"
            />
            <Stat
              label="Value traded"
              value={`PKR ${(map.totalValue / 1e9).toFixed(2)} bn`}
              sub="Approximate: last price × volume"
            />
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {map.tiles.length === 0 ? (
            <EmptyState
              title="No trades recorded yet today"
              description="The map fills once the market opens and the pipeline has collected a price update."
            />
          ) : (
            <MarketMap tiles={map.tiles} />
          )}

          <div className="card mt-8 p-5 sm:p-6">
            <SectionHeading
              as="h2"
              eyebrow="How to read it"
              title="What the size and the colour mean"
              description="Two variables, one picture."
            />
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
              <li>
                <strong className="text-navy-900">Size is the day&apos;s value traded</strong> — the
                last price multiplied by the volume. A bigger tile means more money changed hands,
                not that the company is bigger. The exchange&apos;s own turnover figure sums every
                individual trade, which is not in the data collected here, so this is close but
                not identical to it.
              </li>
              <li>
                <strong className="text-navy-900">Colour is the move</strong>, from −5% in deep rose
                to +5% in deep emerald, on a fixed scale. Fixed matters: it means a green day this
                week looks the same as a green day next week. A scale that stretched to fit each
                session would make a quiet day look dramatic.
              </li>
              <li>
                <strong className="text-navy-900">Groups are PSX sectors</strong>, each sized by the
                total traded across its constituents. Sectors accounting for less than about 1% of
                the day are pooled so their labels remain readable.
              </li>
              <li>
                <strong className="text-navy-900">Only the KSE-100</strong>, and only the names that
                actually traded. A constituent with no volume has no tile.
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/brief"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Read the day&apos;s brief
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/guides/kse-100-vs-kmi-30-vs-kmi-all-shares"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                What the KSE-100 actually measures
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <Disclaimer className="mt-8" />
        </div>
      </section>
    </>
  );
}
