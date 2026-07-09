"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, TrendingUp } from "lucide-react";
import {
  fetchTopPicks,
  type PickCard,
  type PickHorizon,
  type TopPicksResult,
} from "@/lib/api";
import { parsePicksFromHtml } from "@/lib/parseTopPicks";

const TABS: { key: PickHorizon; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

function getPicksForHorizon(result: TopPicksResult, horizon: PickHorizon): PickCard[] {
  const structured =
    horizon === "daily"
      ? result.daily_picks
      : horizon === "monthly"
        ? result.monthly_picks
        : result.yearly_picks;

  if (structured.length > 0) {
    return structured;
  }
  return parsePicksFromHtml(result.report_html, horizon);
}

function PickSkeleton() {
  return (
    <div className="pick-card-premium w-72 shrink-0 animate-pulse sm:w-auto">
      <div className="h-12 bg-[#0B132B]/80" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-full rounded bg-slate-200" />
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function PremiumPickCard({ pick, rank }: { pick: PickCard; rank: number }) {
  const isTop = rank === 1;
  const currentPrice = pick.current_price?.trim() || "Check Market";
  const isMarketText = /check market/i.test(currentPrice);

  return (
    <article
      className={`pick-card-premium w-72 shrink-0 sm:w-auto ${isTop ? "pick-card-premium-top" : ""}`}
    >
      <div className="flex items-center justify-between bg-[#0B132B] px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
            #{rank}
          </span>
          <h3 className="text-lg font-bold tracking-tight">{pick.symbol}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
            {pick.sector}
          </span>
          <TrendingUp className="h-4 w-4 text-emerald-400" />
        </div>
      </div>

      <div className="border-b border-slate-100 px-4 py-3">
        <p className="line-clamp-1 text-sm text-slate-600">{pick.summary}</p>
        <p className="mt-1.5 line-clamp-2 text-sm text-slate-500">
          <span className="font-semibold text-[#0B132B]">Catalyst: </span>
          {pick.why}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-3">
        <div className="bg-white px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Current Price
          </p>
          <p className={`mt-1 text-sm font-bold ${isMarketText ? "text-slate-600" : "text-[#0B132B]"}`}>
            {currentPrice}
          </p>
        </div>
        <div className="bg-white px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Target Buy Zone
          </p>
          <p className="mt-1 text-sm font-bold text-emerald-700">{pick.buy_zone}</p>
        </div>
        <div className="bg-white px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Exit Target
          </p>
          <p className="mt-1 text-sm font-bold text-[#0B132B]">{pick.exit_target}</p>
        </div>
      </div>
    </article>
  );
}

export default function TopPicks() {
  const [result, setResult] = useState<TopPicksResult | null>(null);
  const [activeTab, setActiveTab] = useState<PickHorizon>("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTopPicks();
        if (!cancelled) {
          setResult(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load top picks.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const picks = useMemo(() => {
    if (!result) return [];
    return getPicksForHorizon(result, activeTab);
  }, [result, activeTab]);

  return (
    <section id="top-picks" className="section-divider px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0B132B] via-[#0f1d3a] to-[#0B132B] shadow-lg">
          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                Top 5 Halal Picks
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                AI-curated Shariah-compliant ideas based on today&apos;s PSX market news.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? "bg-emerald-500 text-white shadow-md"
                      : "bg-white/10 text-slate-300 hover:bg-white/20"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <div className="mt-8 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible">
            {Array.from({ length: 3 }).map((_, i) => (
              <PickSkeleton key={i} />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && picks.length === 0 && (
          <p className="mt-8 text-center text-slate-500">
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} picks unavailable.
            Please try again later.
          </p>
        )}

        {!loading && !error && picks.length > 0 && (
          <div className="mt-8 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible lg:gap-5">
            {picks.map((pick, index) => (
              <PremiumPickCard
                key={`${activeTab}-${pick.symbol}`}
                pick={pick}
                rank={index + 1}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
