"use client";

import { useEffect, useState } from "react";
import Marquee from "react-fast-marquee";
import { AlertCircle, ArrowDown, ArrowUp } from "lucide-react";
import { fetchMarketTicker, type MarketTickerItem } from "@/lib/api";

function getChangePercent(item: MarketTickerItem): number {
  const previousClose = item.current_price - item.change;
  if (!previousClose || previousClose <= 0) {
    return 0;
  }

  return (item.change / previousClose) * 100;
}

function TickerCard({ item }: { item: MarketTickerItem }) {
  const up = item.direction === "UP" || item.change >= 0;
  const toneClass = up ? "text-emerald-500" : "text-red-500";
  const borderClass = up ? "border-b-2 border-emerald-500" : "border-b-2 border-red-500";
  const percentChange = getChangePercent(item);
  const sign = percentChange >= 0 ? "+" : "";
  const ArrowIcon = up ? ArrowUp : ArrowDown;

  return (
    <div className={`mx-2 flex items-center gap-3 rounded-md bg-white px-4 py-2 shadow-sm ${borderClass}`}>
      <span className="font-bold text-slate-800">{item.symbol}</span>
      <span className="font-medium text-slate-600">{item.current_price.toFixed(2)}</span>
      <span className={`inline-flex items-center gap-1 ${toneClass}`}>
        <ArrowIcon size={14} />
        <span className="text-sm font-semibold">
          {sign}
          {Math.abs(percentChange).toFixed(2)}%
        </span>
      </span>
    </div>
  );
}

export default function SmartTicker() {
  const [rows, setRows] = useState<MarketTickerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const visibleRows = rows.filter((row) => row.current_price > 0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const data = await fetchMarketTicker();
        if (!cancelled) {
          setRows(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load market ticker.");
        }
      }
    }

    load();
    const refreshTimer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  return (
    <section className="overflow-hidden border-y border-gray-200 bg-slate-50 py-2 min-h-[44px]">
      {error && (
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-1 text-xs text-red-500 sm:px-6">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {!error && visibleRows.length === 0 && (
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 text-sm text-slate-600 sm:px-6">
          <span className="text-xs">Live market ticker is temporarily unavailable.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            suppressHydrationWarning
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Refresh
          </button>
        </div>
      )}

      <div
        className={`transition-opacity duration-200 ${visibleRows.length > 0 ? "opacity-100" : "opacity-0"}`}
      >
        {visibleRows.length > 0 && (
          <Marquee pauseOnHover speed={40} gradient={false}>
            {visibleRows.map((item) => (
              <TickerCard key={item.symbol} item={item} />
            ))}
          </Marquee>
        )}
      </div>
    </section>
  );
}
