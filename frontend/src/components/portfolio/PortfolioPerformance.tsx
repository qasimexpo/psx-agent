"use client";

import { useMemo, useState } from "react";

import RangeTabs from "@/components/charts/RangeTabs";
import { Delta, toneColor } from "@/components/charts/Trend";
import TrendChart, { type ChartSeries } from "@/components/charts/TrendChart";
import { changePct, indexToStart, sliceRange, type PricePoint, type RangeKey } from "@/lib/charts";
import { percent, pkr, signedMoney } from "@/lib/format";

type Mode = "value" | "compare";

// Categorical slots 1 and 2, validated as a pair on white.
const PORTFOLIO = "#2a78d6";
const BENCHMARK = "#eb6834";

// Two decimals: with one, neighbouring ticks such as 1.70M and 1.75M both read "1.7M".
const AXIS_COMPACT = new Intl.NumberFormat("en-PK", { notation: "compact", maximumFractionDigits: 2 });

/**
 * How the shares held today have moved, in rupees or against the KSE-100.
 * Comparing indexes both lines to 0% at the start of the range, so they share
 * one axis honestly instead of a second y-scale.
 */
export default function PortfolioPerformance({
  value,
  benchmark,
  usesTrades,
}: {
  value: PricePoint[];
  benchmark: PricePoint[];
  /** Whether share counts follow recorded trades, which changes what the line means. */
  usesTrades: boolean;
}) {
  const [range, setRange] = useState<RangeKey>("3M");
  const [mode, setMode] = useState<Mode>("value");

  const slice = useMemo(() => sliceRange(value, range), [value, range]);
  const change = changePct(slice);
  const rupees = slice.length > 1 ? slice[slice.length - 1].v - slice[0].v : null;

  const bench = useMemo(() => {
    if (!slice.length) return [];
    const from = slice[0].t;
    return benchmark.filter((point) => point.t >= from);
  }, [benchmark, slice]);
  const benchChange = changePct(bench);

  const series: ChartSeries[] =
    mode === "value"
      ? [{ id: "value", label: "Holdings value", color: toneColor(change), points: slice }]
      : [
          { id: "value", label: "Your holdings", color: PORTFOLIO, points: indexToStart(slice) },
          { id: "kse100", label: "KSE-100", color: BENCHMARK, points: indexToStart(bench) },
        ];

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy-900">Performance</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {usesTrades
              ? "Your holdings' value each day, following your recorded buys and sells. Cash is not included."
              : "What the shares you hold now were worth each day. Record trades to follow past buys and sells."}
          </p>
        </div>
        <div className="text-right">
          <Delta value={change} suffix={range} className="text-base" />
          {rupees !== null ? (
            <p className="tabular text-xs text-slate-500">{signedMoney(rupees)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <RangeTabs value={range} onChange={setRange} />
        <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Chart view">
          {(
            [
              ["value", "Value"],
              ["compare", "vs KSE-100"],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={`focus-ring rounded-md px-3 py-1 text-xs font-semibold transition ${
                mode === key ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900"
              }`}
            >
              {text}
            </button>
          ))}
        </div>
        {mode === "compare" ? (
          <ul className="ml-auto flex items-center gap-4 text-xs text-slate-600" aria-label="Legend">
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: PORTFOLIO }} aria-hidden />
              Your holdings <Delta value={change} />
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: BENCHMARK }} aria-hidden />
              KSE-100 <Delta value={benchChange} />
            </li>
          </ul>
        ) : null}
      </div>

      <div className="mt-4">
        <TrendChart
          series={series}
          label={
            mode === "value"
              ? `Value of your current holdings over ${range}`
              : `Your holdings compared with the KSE-100 over ${range}, as percent change`
          }
          formatValue={mode === "value" ? pkr : (v) => percent(v)}
          formatAxis={mode === "value" ? (v) => AXIS_COMPACT.format(v) : (v) => percent(v)}
          height={240}
          emptyMessage={
            usesTrades
              ? "The chart starts from your first trade and grows a day at a time."
              : "Not enough price history yet. It fills in after the next daily update."
          }
        />
      </div>
    </section>
  );
}
