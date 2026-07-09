"use client";

import { useEffect, useState } from "react";
import Marquee from "react-fast-marquee";
import { AlertCircle, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visibleRows = rows.filter((row) => row.current_price > 0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
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

  if (loading) {
    return (
      <section className="border-y border-gray-200 bg-slate-50 px-4 py-2 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          Loading market ticker...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="border-y border-gray-200 bg-slate-50 px-4 py-2 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      </section>
    );
  }

  if (visibleRows.length === 0) {
    return (
      <section className="border-y border-gray-200 bg-slate-50 px-4 py-2 sm:px-6">
        <div className="mx-auto max-w-6xl text-sm text-slate-600">
          Live market ticker is temporarily unavailable. Please refresh shortly.
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden border-y border-gray-200 bg-slate-50 py-2">
      <Marquee pauseOnHover speed={40} gradient={false}>
        {visibleRows.map((item) => (
          <TickerCard key={item.symbol} item={item} />
        ))}
      </Marquee>
    </section>
  );
}
