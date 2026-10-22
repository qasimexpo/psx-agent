"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import { CHART_MARGIN, niceTicks, toMs, type PricePoint } from "@/lib/charts";
import { compact } from "@/lib/format";

import { useMeasuredWidth } from "./useMeasuredWidth";

/**
 * Daily traded volume, drawn as its own small chart under the price chart
 * rather than on a second y-axis. It shares the price chart's margins and
 * time scale, so each bar sits under its day. One recessive hue: volume is
 * context for the price, not a second headline. Each bar is a hover and
 * keyboard target; the table view has every value.
 */

const BAR = "#94a3b8"; // slate-400; values also in the tooltip and table (relief for < 3:1)
const BAR_ACTIVE = "#475569";
const DAY_LONG = new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function VolumeBars({
  points,
  domain,
  height = 72,
}: {
  points: PricePoint[];
  /** The price chart's first and last day, so the bars line up under it. */
  domain?: [string, string];
  height?: number;
}) {
  const [wrapRef, measured] = useMeasuredWidth();
  const [active, setActive] = useState<number | null>(null);
  const bars = points.filter((p): p is PricePoint & { vol: number } => typeof p.vol === "number");
  if (bars.length < 2) return null;

  const width = measured ?? 720;
  const margin = CHART_MARGIN;
  const plotW = Math.max(40, width - margin.left - margin.right);
  const top = 6;
  const first = toMs(domain?.[0] ?? bars[0].t);
  const last = toMs(domain?.[1] ?? bars[bars.length - 1].t);
  const x = (ms: number) => margin.left + ((ms - first) / (last - first || 1)) * plotW;
  const max = Math.max(...bars.map((b) => b.vol), 1);
  const ticks = niceTicks(0, max, 2).filter((t) => t > 0);
  const top_ = ticks.length ? Math.max(max, ticks[ticks.length - 1]) : max;
  const y = (v: number) => top + (1 - v / top_) * height;
  const barWidth = Math.max(1, Math.min(8, (plotW / bars.length) * 0.7));

  // The nearest bar to the pointer anywhere in the panel, like the price
  // chart's crosshair: bars sit on real dates, so weekends leave gaps that a
  // per-bar hit area would miss.
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const at = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < bars.length; i += 1) {
      if (Math.abs(x(toMs(bars[i].t)) - at) < Math.abs(x(toMs(bars[best].t)) - at)) best = i;
    }
    setActive(best);
  }
  const focused = active === null ? null : bars[active];

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const end = bars.length - 1;
    const next: Record<string, number> = {
      ArrowLeft: Math.max(0, (active ?? end) - 1),
      ArrowRight: Math.min(end, (active ?? end) + 1),
      Home: 0,
      End: end,
    };
    if (event.key in next) {
      event.preventDefault();
      setActive(next[event.key]);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  return (
    <div className="mt-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Volume</p>
      <div ref={wrapRef} className="relative">
        {measured === null ? (
          <div style={{ height: height + top + 4 }} aria-hidden />
        ) : (
          <svg
            width={width}
            height={height + top + 4}
            role="img"
            aria-label="Daily traded volume"
            tabIndex={0}
            className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            onFocus={() => setActive((current) => current ?? bars.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKeyDown}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
            onPointerLeave={() => setActive(null)}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={margin.left} x2={margin.left + plotW} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" shapeRendering="crispEdges" />
                <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="#64748b">
                  {compact(tick)}
                </text>
              </g>
            ))}
            <line x1={margin.left} x2={margin.left + plotW} y1={top + height} y2={top + height} stroke="#e2e8f0" shapeRendering="crispEdges" />
            {bars.map((bar, index) => {
              const cx = x(toMs(bar.t));
              const barTop = y(bar.vol);
              return (
                <g key={bar.t}>
                  <rect
                    x={cx - barWidth / 2}
                    y={barTop}
                    width={barWidth}
                    height={Math.max(0, top + height - barTop)}
                    rx={Math.min(2, barWidth / 2)}
                    fill={active === index ? BAR_ACTIVE : BAR}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {focused ? (
          <div
            className="pointer-events-none absolute -top-7 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
            style={{ left: Math.min(Math.max(0, x(toMs(focused.t)) - 60), width - 130) }}
            role="status"
          >
            <span className="tabular font-semibold text-navy-900">{compact(focused.vol)}</span>{" "}
            <span className="text-slate-500">shares · {DAY_LONG.format(new Date(toMs(focused.t)))}</span>
          </div>
        ) : null}
      </div>
      <details className="mt-1 text-xs text-slate-500">
        <summary className="cursor-pointer select-none hover:text-navy-900">Volume as table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Daily traded volume</caption>
            <tbody className="tabular text-slate-700">
              {[...bars].reverse().map((bar) => (
                <tr key={bar.t} className="border-t border-slate-100">
                  <td className="py-1 pr-4">{DAY_LONG.format(new Date(toMs(bar.t)))}</td>
                  <td className="py-1 text-right">{bar.vol.toLocaleString("en-PK")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
