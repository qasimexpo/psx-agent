"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, TrendingUp } from "lucide-react";
import SectorSelector from "@/components/SectorSelector";
import {
  fetchTopPicks,
  type PickCard,
  type PickHorizon,
} from "@/lib/api";
import {
  getSectorLabel,
  TOP_PICK_SECTOR_ALL,
  type TopPickSector,
} from "@/lib/topPickSectors";

const TABS: { key: PickHorizon; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

const PICKS_GRID_CLASS =
  "mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3";

type PicksCacheKey = `${PickHorizon}:${TopPickSector}`;

function cacheKey(horizon: PickHorizon, sector: TopPickSector): PicksCacheKey {
  return `${horizon}:${sector}`;
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

function PickCardSkeleton() {
  return (
    <article className="pick-card-skeleton flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="h-12 animate-pulse bg-slate-200" />
      <div className="space-y-2 border-b border-slate-100 px-4 py-3">
        <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2 bg-white px-3 py-3">
            <div className="h-2 w-16 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </article>
  );
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
          <span className="max-w-[9rem] truncate rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
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
  const [picksCache, setPicksCache] = useState<Partial<Record<PicksCacheKey, PickCard[]>>>({});
  const [activeTab, setActiveTab] = useState<PickHorizon>("daily");
  const [activeSector, setActiveSector] = useState<TopPickSector>(TOP_PICK_SECTOR_ALL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPicks = useCallback(async (horizon: PickHorizon, sector: TopPickSector) => {
    const key = cacheKey(horizon, sector);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTopPicks(horizon, sector);
      setPicksCache((current) => ({ ...current, [key]: data.picks }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load top picks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPicks(activeTab, activeSector);
  }, [activeTab, activeSector, loadPicks]);

  const picks = picksCache[cacheKey(activeTab, activeSector)] ?? [];
  const isSwitching = loading && picks.length > 0;
  const sectorLabel = getSectorLabel(activeSector);
  const horizonLabel = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);

  return (
    <section id="top-picks" className="section-divider scroll-mt-20 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0B132B] via-[#0f1d3a] to-[#0B132B] shadow-lg">
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  Top Halal Picks
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  AI-curated Shariah-compliant picks by sector and investment horizon.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  {TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
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
                <SectorSelector
                  value={activeSector}
                  onChange={setActiveSector}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {loading && picks.length === 0 && !error && (
          <div className={`${PICKS_GRID_CLASS}`}>
            {[0, 1, 2].map((index) => (
              <PickCardSkeleton key={`skeleton-${index}`} />
            ))}
          </div>
        )}

        {!loading && !error && picks.length === 0 && (
          <p className="mt-8 text-center text-slate-500">
            {horizonLabel} picks for {sectorLabel} are not in the database yet. The daily
            update job may still be running — please check back shortly.
          </p>
        )}

        {!error && picks.length > 0 && (
          <div
            className={`${PICKS_GRID_CLASS} transition-opacity duration-150 ${isSwitching ? "opacity-40" : "opacity-100"}`}
          >
            {picks.map((pick, index) => (
              <PremiumPickCard
                key={`${activeTab}-${activeSector}-${pick.symbol}-${index}`}
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
