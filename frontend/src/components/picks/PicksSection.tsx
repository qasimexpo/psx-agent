"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-fit shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
            {HORIZONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setHorizon(item.key)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition focus-ring ${
                  horizon === item.key
                    ? "bg-white text-navy-900 shadow-sm"
                    : "text-slate-600 hover:text-navy-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="table-scroll -mx-1 min-w-0 px-1">
            <div className="flex gap-1.5">
              {sectors.map((sector) => {
                const isActive = sector === activeSector;
                const slug = slugForSector(sector);
                const href = slug ? `/picks/${slug}` : "/";
                return (
                  <Link
                    key={sector}
                    href={href}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-navy-900"
                    }`}
                  >
                    {sector}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          {active.blurb}
          {pickDate ? ` · Generated ${shortDate(pickDate)}` : null}
        </p>

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
