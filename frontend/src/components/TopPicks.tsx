"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, TrendingUp } from "lucide-react";
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

const PICKS_GRID_CLASS =
  "mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3";

const PICKS_KEY: Record<PickHorizon, keyof TopPicksResult> = {
  daily: "daily_picks",
  monthly: "monthly_picks",
  yearly: "yearly_picks",
};

function extractPicks(result: TopPicksResult, horizon: PickHorizon): PickCard[] {
  const structured = result[PICKS_KEY[horizon]] as PickCard[];
  if (structured.length > 0) {
    return structured;
  }
  return parsePicksFromHtml(result.report_html, horizon);
}

function formatPickPrice(value: string): string {
  const trimmed = value?.trim() || "";
  if (!trimmed || /^(n\/a|na|check market)$/i.test(trimmed)) {
    return "N/A";
  }
  const numeric = Number(trimmed.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "N/A";
  }
  return `${numeric.toFixed(2)} PKR`;
}

function PremiumPickCard({ pick, rank }: { pick: PickCard; rank: number }) {
  const isTop = rank === 1;
  const currentPrice = formatPickPrice(pick.current_price);
  const isMarketText = currentPrice === "N/A";

  return (
    <article
      className={`pick-card-premium flex flex-col ${isTop ? "pick-card-premium-top" : ""}`}
    >
      <div className="flex shrink-0 items-center justify-between bg-[#0B132B] px-4 py-2.5 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
            #{rank}
          </span>
          <h3 className="text-lg font-bold tracking-tight">{pick.symbol}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="max-w-[7rem] truncate rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
            {pick.sector}
          </span>
          <TrendingUp className="h-4 w-4 shrink-0 text-emerald-400" />
        </div>
      </div>

      <div className="border-b border-slate-100 px-4 py-2.5">
        <p className="line-clamp-2 text-sm text-slate-600">{pick.summary}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
          <span className="font-semibold text-[#0B132B]">Catalyst: </span>
          {pick.why}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-3">
        <div className="bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Current Price
          </p>
          <p
            className={`mt-0.5 line-clamp-2 text-sm font-bold leading-tight ${isMarketText ? "text-slate-600" : "text-[#0B132B]"}`}
          >
            {currentPrice}
          </p>
        </div>
        <div className="bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Target Buy Zone
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-emerald-700">
            {pick.buy_zone}
          </p>
        </div>
        <div className="bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Exit Target
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-[#0B132B]">
            {pick.exit_target}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function TopPicks() {
  const [picksCache, setPicksCache] = useState<Partial<Record<PickHorizon, PickCard[]>>>({});
  const [activeTab, setActiveTab] = useState<PickHorizon>("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategory = useCallback(async (horizon: PickHorizon) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTopPicks(horizon);
      const picks = extractPicks(data, horizon);
      setPicksCache((current) => ({ ...current, [horizon]: picks }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load top picks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategory("daily");
  }, [loadCategory]);

  const handleTabChange = (horizon: PickHorizon) => {
    setActiveTab(horizon);
    if (picksCache[horizon]) {
      return;
    }
    loadCategory(horizon);
  };

  const picks = picksCache[activeTab] ?? [];
  const isSwitching = loading && picks.length > 0;

  return (
    <section id="top-picks" className="section-divider scroll-mt-20 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0B132B] via-[#0f1d3a] to-[#0B132B] shadow-lg">
          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                Top 6 Halal Picks
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                AI-curated Shariah-compliant ideas based on today&apos;s PSX market news.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  suppressHydrationWarning
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? "bg-emerald-500 text-white shadow-md"
                      : "bg-white/10 text-slate-300 hover:bg-white/20"
                  }`}
                >
                  {tab.label}
                  {loading && activeTab === tab.key && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && picks.length === 0 && (
          <p className="mt-8 text-center text-slate-500">
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} picks are not in the
            database yet. The daily update job may still be running — please check back shortly.
          </p>
        )}

        {!error && picks.length > 0 && (
          <div
            className={`${PICKS_GRID_CLASS} transition-opacity duration-150 ${isSwitching ? "opacity-40" : "opacity-100"}`}
          >
            {picks.map((pick, index) => (
              <PremiumPickCard
                key={`${activeTab}-${pick.symbol}-${index}`}
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
