"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { fetchMarketIndex, type MarketIndexResult } from "@/lib/api";

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;

  const width = 120;
  const height = 36;
  const padding = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const isUp = values[values.length - 1] >= values[0];
  const stroke = isUp ? "#34d399" : "#f87171";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16 w-full min-w-[220px] shrink-0"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}

export default function MarketIndexBar() {
  const [data, setData] = useState<MarketIndexResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchMarketIndex();
        if (!cancelled) {
          setData(result);
        }
      } catch {
        // keep last known data or skeleton
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isPositive = (data?.change ?? 0) >= 0;

  return (
    <section className="px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-2xl border border-[#1e293b] bg-gradient-to-br from-[#0B132B] via-[#122042] to-[#0B132B] p-5 text-white shadow-xl sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
              Pakistan Stock Exchange
            </p>
            <h3 className="mt-1 text-2xl font-bold sm:text-3xl">KSE-100 Market Index</h3>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        {loading && !data ? (
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading KSE-100...</span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-4 sm:gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                  {data?.name ?? "KSE-100 Index"}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">
                  {data?.value
                    ? data.value.toLocaleString("en-PK", { maximumFractionDigits: 2 })
                    : "—"}
                </p>
              </div>

              {data && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    isPositive
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  {isPositive ? "+" : ""}
                  {data.change.toLocaleString("en-PK", { maximumFractionDigits: 2 })} (
                  {isPositive ? "+" : ""}
                  {data.change_pct.toFixed(2)}%)
                </span>
              )}
            </div>

            <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4 lg:w-auto">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-300">
                Intraday Trend
              </p>
              {data?.sparkline && data.sparkline.length > 1 ? (
                <Sparkline values={data.sparkline} />
              ) : (
                <p className="text-sm text-slate-400">Chart unavailable</p>
              )}
            </div>
          </>
        )}
          </div>
        </div>
      </div>
    </section>
  );
}
