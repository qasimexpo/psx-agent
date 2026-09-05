"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, ShieldCheck } from "lucide-react";
import type { Pick } from "@/lib/db";
import { money, parsePickPrice, percent, shortDate } from "@/lib/format";
import { slugForSector } from "@/lib/sectors";
import { EmptyState, SectionHeading } from "@/components/ui/Primitives";

/**
 * All three horizons for every sector are rendered by the server and handed to
 * this component, so switching a tab is instant and needs no network call. The
 * previous version fetched on every tab change and showed a spinner each time.
 */

export type PicksBundle = {
  daily: Pick[];
  monthly: Pick[];
  yearly: Pick[];
};

type Horizon = keyof PicksBundle;

const HORIZONS: { key: Horizon; label: string; blurb: string }[] = [
  { key: "daily", label: "Short term", blurb: "Swing setups, roughly 1 to 4 weeks" },
  { key: "monthly", label: "Medium term", blurb: "Catalyst driven, roughly 1 to 6 months" },
  { key: "yearly", label: "Long term", blurb: "Compounding and dividend holds, a year or more" },
];

function PickCard({ pick, rank, livePrice }: { pick: Pick; rank: number; livePrice?: number }) {
  const entry = parsePickPrice(pick.current_price);
  const move = entry && livePrice ? ((livePrice - entry) / entry) * 100 : null;

  return (
    <article className="card card-hover flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-navy-900 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">
            {rank}
          </span>
          <Link
            href={`/stock/${pick.symbol}`}
            className="truncate text-base font-bold text-white hover:text-emerald-300"
          >
            {pick.symbol}
          </Link>
          {move !== null ? (
            <span
              className={`tabular shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                move >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
              }`}
              title="Move since this pick was published"
            >
              {percent(move)}
            </span>
          ) : null}
        </div>
        <span className="badge badge-on-dark shrink-0">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          Halal
        </span>
      </div>

      <div className="flex-1 space-y-2.5 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{pick.sector}</p>
        <p className="text-sm leading-relaxed text-slate-700">{pick.summary}</p>
        <p className="text-sm leading-relaxed text-slate-600">
          <span className="font-semibold text-navy-900">Why now: </span>
          {pick.why}
        </p>
        {pick.risk ? (
          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900">
            <span className="font-semibold">Risk: </span>
            {pick.risk}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-px border-t border-slate-100 bg-slate-100">
        <div className="bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            At pick
          </p>
          <p className="tabular mt-0.5 text-sm font-bold text-navy-900">
            {entry ? money(entry) : "—"}
          </p>
        </div>
        <div className="bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Buy zone
          </p>
          <p className="tabular mt-0.5 text-sm font-bold text-emerald-700">{pick.buy_zone}</p>
        </div>
        <div className="bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Target
          </p>
          <p className="tabular mt-0.5 text-sm font-bold text-navy-900">{pick.exit_target}</p>
        </div>
      </div>
    </article>
  );
}

export default function PicksSection({
  bundle,
  sectors,
  activeSector,
  pickDate,
  livePrices = {},
}: {
  bundle: PicksBundle;
  sectors: string[];
  activeSector: string;
  pickDate: string | null;
  livePrices?: Record<string, number>;
}) {
  const router = useRouter();
  const [horizon, setHorizon] = useState<Horizon>("daily");
  const picks = bundle[horizon] ?? [];
  const active = useMemo(() => HORIZONS.find((h) => h.key === horizon)!, [horizon]);

  return (
    <section id="picks" className="scroll-mt-20 bg-white px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Refreshed every trading morning"
          title="Top halal picks"
          description="Every candidate is a constituent of the KMI All Shares Islamic Index, so compliance is decided by the exchange rather than by the model. The AI only explains and ranks what it is given."
          action={
            <Link
              href="/track-record"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-navy-900 transition hover:border-emerald-300 hover:text-emerald-700"
            >
              See the track record
            </Link>
          }
        />

        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200">
          {/* Horizon is the primary control, so it gets its own row with the
              context for the selected one sitting directly beneath it. */}
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="tablist"
              aria-label="Investment horizon"
              className="flex w-full gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 sm:w-auto"
            >
              {HORIZONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={horizon === item.key}
                  onClick={() => setHorizon(item.key)}
                  className={`focus-ring flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition sm:flex-none ${
                    horizon === item.key
                      ? "bg-navy-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-navy-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <p className="tabular text-xs text-slate-500 sm:text-right">
              <span className="font-semibold text-navy-900">
                {picks.length} {picks.length === 1 ? "pick" : "picks"}
              </span>
              {pickDate ? <> · generated {shortDate(pickDate)}</> : null}
              <span className="block sm:mt-0.5">{active.blurb}</span>
            </p>
          </div>

          {/* Sectors wrap onto as many lines as they need rather than sitting in
              a scroller, which is what put a native scrollbar under the row. */}
          <div className="px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <span className="shrink-0 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Sector
              </span>

              {/* Phones get a real select; a row of chips is awkward to tap. */}
              <div className="sm:hidden">
                <label htmlFor="sector-select" className="sr-only">
                  Choose a sector
                </label>
                <select
                  id="sector-select"
                  value={activeSector}
                  onChange={(event) => {
                    const slug = slugForSector(event.target.value);
                    router.push(slug ? `/picks/${slug}` : "/");
                  }}
                  className="focus-ring w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-navy-900"
                >
                  {sectors.map((sector) => (
                    <option key={sector} value={sector}>
                      {sector === "All" ? "All sectors" : sector}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hidden flex-wrap gap-1.5 sm:flex">
                {sectors.map((sector) => {
                  const isActive = sector === activeSector;
                  const slug = slugForSector(sector);
                  const href = slug ? `/picks/${slug}` : "/";
                  return (
                    <Link
                      key={sector}
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={`focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-navy-900"
                      }`}
                    >
                      {sector === "All" ? "All sectors" : sector}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {picks.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {picks.map((pick, index) => (
              <PickCard
                key={`${horizon}-${pick.symbol}`}
                pick={pick}
                rank={index + 1}
                livePrice={livePrices[pick.symbol]}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Inbox className="h-9 w-9" />}
            title="No picks generated yet"
            description="Picks are produced each trading morning at 09:15 Pakistan time. If this is a fresh deployment, run the picks job once and they will appear here."
          />
        )}
      </div>
    </section>
  );
}
