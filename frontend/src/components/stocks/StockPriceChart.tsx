"use client";

import { useEffect, useMemo, useState } from "react";

import RangeTabs from "@/components/charts/RangeTabs";
import { Delta, toneColor } from "@/components/charts/Trend";
import TrendChart from "@/components/charts/TrendChart";
import { changePct, sliceRange, withLatest, type PricePoint, type RangeKey } from "@/lib/charts";
import { money } from "@/lib/format";

/**
 * The stock page's price chart. History comes from a CDN-cached API route,
 * so the statically generated page stays small; today's live quote is
 * appended so the line ends at the price shown in the header.
 */
export default function StockPriceChart({
  symbol,
  price,
  quoteAt,
}: {
  symbol: string;
  price: number | null;
  quoteAt: string | null;
}) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<RangeKey>("6M");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/history/${encodeURIComponent(symbol)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((body: { points?: PricePoint[] }) => {
        if (!cancelled) setPoints(body.points ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const full = useMemo(() => withLatest(points ?? [], price, quoteAt), [points, price, quoteAt]);
  const slice = useMemo(() => sliceRange(full, range), [full, range]);
  const change = changePct(slice);

  return (
    <section className="card mt-4 p-5 sm:p-6" aria-labelledby="price-chart-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 id="price-chart-title" className="text-base font-bold text-navy-900">
            Price chart
          </h2>
          {points ? <Delta value={change} suffix={range} /> : null}
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="mt-4">
        {failed ? (
          <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            The price chart could not be loaded. Refresh the page to try again.
          </p>
        ) : points === null ? (
          <div
            className="flex items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400"
            style={{ height: 298 }}
          >
            Loading chart…
          </div>
        ) : (
          <TrendChart
            series={[{ id: symbol, label: symbol, color: toneColor(change), points: slice }]}
            label={`${symbol} closing price over ${range}`}
            formatValue={(v) => `Rs ${money(v)}`}
            formatAxis={money}
            height={260}
          />
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">Daily closing prices from the Pakistan Stock Exchange.</p>
    </section>
  );
}
