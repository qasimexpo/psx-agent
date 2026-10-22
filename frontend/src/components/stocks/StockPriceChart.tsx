"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import RangeTabs from "@/components/charts/RangeTabs";
import { Delta, toneColor } from "@/components/charts/Trend";
import TrendChart, { type ChartSeries } from "@/components/charts/TrendChart";
import VolumeBars from "@/components/charts/VolumeBars";
import SymbolInput from "@/components/tools/SymbolInput";
import { changePct, indexToStart, sliceRange, withLatest, type PricePoint, type RangeKey } from "@/lib/charts";
import { money, percent } from "@/lib/format";

// Categorical slots 1-3: the reference validates these three together for
// every pair, which is what overlapping lines need.
const COMPARE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
const MAX_COMPARE = 2;

async function loadHistory(symbol: string): Promise<PricePoint[]> {
  const response = await fetch(`/api/history/${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error(String(response.status));
  return ((await response.json()) as { points?: PricePoint[] }).points ?? [];
}

/**
 * The stock page's price chart. History comes from a CDN-cached API route,
 * so the statically generated page stays small; today's live quote is
 * appended so the line ends at the price in the header. Adding other stocks
 * switches to percent change from the start of the range, all on one axis.
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
  const [compare, setCompare] = useState<{ symbol: string; points: PricePoint[] }[]>([]);
  const [draft, setDraft] = useState("");
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHistory(symbol)
      .then((loaded) => !cancelled && setPoints(loaded))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const full = useMemo(() => withLatest(points ?? [], price, quoteAt), [points, price, quoteAt]);
  const slice = useMemo(() => sliceRange(full, range), [full, range]);
  const change = changePct(slice);
  const comparing = compare.length > 0;

  const series: ChartSeries[] = useMemo(() => {
    if (!comparing) {
      return [{ id: symbol, label: symbol, color: toneColor(change), points: slice }];
    }
    const from = slice[0]?.t ?? "";
    return [
      { id: symbol, label: symbol, color: COMPARE_COLORS[0], points: indexToStart(slice) },
      ...compare.map((other, index) => ({
        id: other.symbol,
        label: other.symbol,
        color: COMPARE_COLORS[index + 1],
        points: indexToStart(other.points.filter((p) => p.t >= from)),
      })),
    ];
  }, [comparing, compare, slice, symbol, change]);

  async function addCompare() {
    const other = draft.trim().toUpperCase();
    setCompareError(null);
    if (!other || other === symbol || compare.some((c) => c.symbol === other)) return;
    try {
      const loaded = await loadHistory(other);
      if (loaded.length < 2) {
        setCompareError(`No price history for ${other} yet.`);
        return;
      }
      setCompare((current) => [...current, { symbol: other, points: loaded }].slice(0, MAX_COMPARE));
      setDraft("");
    } catch {
      setCompareError(`Could not load ${other}.`);
    }
  }

  return (
    <section className="card mt-4 p-5 sm:p-6" aria-labelledby="price-chart-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 id="price-chart-title" className="text-base font-bold text-navy-900">
            {comparing ? "Comparison" : "Price chart"}
          </h2>
          {points && !comparing ? <Delta value={change} suffix={range} /> : null}
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        {comparing ? (
          <ul className="flex flex-wrap items-center gap-2" aria-label="Legend">
            {series.map((line, index) => (
              <li key={line.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-2.5 pr-1.5 text-xs">
                <span className="h-0.5 w-4 rounded" style={{ background: line.color }} aria-hidden />
                <span className="font-semibold text-navy-900">{line.label}</span>
                <Delta value={changePct(index === 0 ? slice : compare[index - 1].points.filter((p) => p.t >= (slice[0]?.t ?? "")))} />
                {index > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCompare((current) => current.filter((c) => c.symbol !== line.id))}
                    aria-label={`Stop comparing ${line.label}`}
                    className="focus-ring rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-navy-900"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {compare.length < MAX_COMPARE ? (
          <form
            className="ml-auto flex items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addCompare();
            }}
          >
            <div className="w-40">
              <SymbolInput id="compare-symbol" value={draft} onChange={setDraft} placeholder="Compare with…" exclude={[symbol]} />
            </div>
            <button
              type="submit"
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Compare
            </button>
          </form>
        ) : null}
      </div>
      {compareError ? <p className="mt-1 text-xs text-rose-600">{compareError}</p> : null}

      <div className="mt-4">
        {failed ? (
          <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            The price chart could not be loaded. Refresh the page to try again.
          </p>
        ) : points === null ? (
          <div className="flex items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400" style={{ height: 298 }}>
            Loading chart…
          </div>
        ) : (
          <>
            <TrendChart
              series={series}
              label={comparing ? `${symbol} compared with ${compare.map((c) => c.symbol).join(" and ")}, percent change over ${range}` : `${symbol} closing price over ${range}`}
              formatValue={comparing ? (v) => percent(v) : (v) => `Rs ${money(v)}`}
              formatAxis={comparing ? (v) => percent(v) : money}
              height={260}
            />
            {!comparing && slice.length > 1 ? (
              <VolumeBars points={slice} domain={[slice[0].t, slice[slice.length - 1].t]} />
            ) : null}
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">Daily closing prices and volume from the Pakistan Stock Exchange.</p>
    </section>
  );
}
