"use client";

import {
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { CHART_MARGIN, niceTicks, toMs, type PricePoint } from "@/lib/charts";

import { useMeasuredWidth } from "./useMeasuredWidth";

export type ChartSeries = { id: string; label: string; color: string; points: PricePoint[] };

/**
 * A time-series line chart in plain SVG.
 *
 * Hairline grid, 2px lines, a 10% area wash when there is one series, an end
 * dot with a surface ring and the last value beside it. A crosshair snaps to
 * the nearest day and its tooltip lists every series; the arrow keys move it
 * when the chart has focus. Every value is also in the table under the chart,
 * so the tooltip never gates anything. Text uses text colours; only marks
 * carry the series colour.
 */

const GRID = "#e2e8f0";
const AXIS_TEXT = "#64748b";
const SURFACE = "#ffffff";
const LABEL_GAP = 14;

const DAY_SHORT = new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-PK", { month: "short", year: "2-digit", timeZone: "UTC" });
const DAY_LONG = new Intl.DateTimeFormat("en-PK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Index of the last point at or before `ms`, or -1. Points are oldest first. */
function atOrBefore(points: { ms: number }[], ms: number): number {
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (points[mid].ms <= ms) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export default function TrendChart({
  series,
  label,
  formatValue,
  formatAxis = formatValue,
  height = 260,
  pending = false,
  emptyMessage = "Not enough price history yet. It fills in after the next daily update.",
}: {
  series: ChartSeries[];
  /** What the chart shows, for screen readers and the table caption. */
  label: string;
  formatValue: (value: number) => string;
  formatAxis?: (value: number) => string;
  /** Plot height in px; the axis band is added to it. */
  height?: number;
  /** Hold the previous render, dimmed, while new data loads. */
  pending?: boolean;
  /** Shown instead of the chart when there are fewer than two days to draw. */
  emptyMessage?: string;
}) {
  const [wrapRef, measured] = useMeasuredWidth();
  const width = measured ?? 720;
  const [active, setActive] = useState<number | null>(null);

  const lines = useMemo(
    () =>
      series
        .filter((item) => item.points.length > 0)
        .map((item) => ({ ...item, pts: item.points.map((p) => ({ ...p, ms: toMs(p.t) })) })),
    [series],
  );
  const days = useMemo(
    () => [...new Set(lines.flatMap((line) => line.pts.map((p) => p.ms)))].sort((a, b) => a - b),
    [lines],
  );

  if (!lines.length || days.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500"
        style={{ height: height + 26 }}
      >
        {emptyMessage}
      </div>
    );
  }

  const multi = lines.length > 1;
  const margin = CHART_MARGIN;
  const plotW = Math.max(40, width - margin.left - margin.right);
  const totalH = height + margin.top + margin.bottom;

  const values = lines.flatMap((line) => line.pts.map((p) => p.v));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low) * 0.08 || Math.abs(high) * 0.02 || 1;
  const ticks = niceTicks(low - pad, high + pad, 4);
  const domainLow = Math.min(ticks[0] ?? low, low - pad);
  const domainHigh = Math.max(ticks[ticks.length - 1] ?? high, high + pad);

  const xMin = days[0];
  const xMax = days[days.length - 1];
  const x = (ms: number) => margin.left + ((ms - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v: number) =>
    margin.top + (1 - (v - domainLow) / (domainHigh - domainLow || 1)) * height;
  const baseline = margin.top + height;

  const spanDays = (xMax - xMin) / 86_400_000;
  const dateTick = spanDays > 200 ? MONTH_YEAR : DAY_SHORT;
  const xTickCount = width < 480 ? 3 : 5;
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    days[Math.round((i / (xTickCount - 1)) * (days.length - 1))],
  );

  const ends = lines.map((line) => {
    const last = line.pts[line.pts.length - 1];
    return { id: line.id, color: line.color, x: x(last.ms), y: y(last.v), v: last.v };
  });
  // Converging end labels would detach from their lines; drop them and let
  // the legend and tooltip carry the values instead.
  const endLabelsFit =
    !multi ||
    ends.every((a, i) => ends.every((b, j) => i === j || Math.abs(a.y - b.y) >= LABEL_GAP));

  const activeMs = active === null ? null : days[active];
  const readout =
    activeMs === null
      ? []
      : lines.map((line) => {
          const index = atOrBefore(line.pts, activeMs);
          return { line, point: index >= 0 ? line.pts[index] : null };
        });

  function pointToIndex(clientX: number, rect: DOMRect): number {
    const ms = xMin + ((clientX - rect.left - margin.left) / plotW) * (xMax - xMin);
    const index = atOrBefore(days.map((d) => ({ ms: d })), ms);
    if (index < 0) return 0;
    const next = Math.min(index + 1, days.length - 1);
    return Math.abs(days[next] - ms) < Math.abs(days[index] - ms) ? next : index;
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    setActive(pointToIndex(event.clientX, event.currentTarget.getBoundingClientRect()));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const last = days.length - 1;
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(0, (active ?? last) - 1),
      ArrowRight: Math.min(last, (active ?? last) + 1),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const crossX = activeMs === null ? null : x(activeMs);
  const tooltipLeft =
    crossX === null ? 0 : crossX > width - 200 ? Math.max(0, crossX - 192) : crossX + 12;

  return (
    <div>
      <div
        ref={wrapRef}
        className={`relative transition-opacity ${pending ? "opacity-50" : ""}`}
      >
        {measured === null ? (
          <div style={{ height: totalH }} aria-hidden />
        ) : (
        <svg
          width={width}
          height={totalH}
          viewBox={`0 0 ${width} ${totalH}`}
          role="img"
          aria-label={label}
          tabIndex={0}
          className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((current) => current ?? days.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={margin.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                stroke={GRID}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={margin.left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fontSize={11}
                fill={AXIS_TEXT}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatAxis(tick)}
              </text>
            </g>
          ))}

          {xTicks.map((ms, i) => (
            <text
              key={`${ms}-${i}`}
              x={x(ms)}
              y={baseline + 18}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill={AXIS_TEXT}
            >
              {dateTick.format(new Date(ms))}
            </text>
          ))}

          {lines.map((line) => {
            const path = line.pts
              .map((p, i) => `${i ? "L" : "M"}${x(p.ms).toFixed(1)},${y(p.v).toFixed(1)}`)
              .join("");
            const first = line.pts[0];
            const last = line.pts[line.pts.length - 1];
            return (
              <g key={line.id}>
                {!multi ? (
                  <path
                    d={`${path}L${x(last.ms).toFixed(1)},${baseline}L${x(first.ms).toFixed(1)},${baseline}Z`}
                    fill={line.color}
                    fillOpacity={0.1}
                  />
                ) : null}
                <path
                  d={path}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {ends.map((end) => (
            <g key={end.id}>
              <circle cx={end.x} cy={end.y} r={4} fill={end.color} stroke={SURFACE} strokeWidth={2} />
              {endLabelsFit ? (
                <text
                  x={end.x + 9}
                  y={end.y + 4}
                  fontSize={11}
                  fontWeight={600}
                  fill="#0b132b"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatAxis(end.v)}
                </text>
              ) : null}
            </g>
          ))}

          {crossX !== null ? (
            <g pointerEvents="none">
              <line x1={crossX} x2={crossX} y1={margin.top} y2={baseline} stroke="#94a3b8" strokeWidth={1} />
              {readout.map(({ line, point }) =>
                point ? (
                  <circle
                    key={line.id}
                    cx={x(point.ms)}
                    cy={y(point.v)}
                    r={4}
                    fill={line.color}
                    stroke={SURFACE}
                    strokeWidth={2}
                  />
                ) : null,
              )}
            </g>
          ) : null}
        </svg>
        )}

        {activeMs !== null ? (
          <div
            className="pointer-events-none absolute top-2 w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
            style={{ left: tooltipLeft }}
            role="status"
          >
            <p className="text-slate-500">{DAY_LONG.format(new Date(activeMs))}</p>
            {readout.map(({ line, point }) => (
              <p key={line.id} className="mt-1 flex items-center gap-2">
                <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: line.color }} aria-hidden />
                <span className="tabular font-semibold text-navy-900">
                  {point ? formatValue(point.v) : "—"}
                </span>
                {multi ? <span className="truncate text-slate-500">{line.label}</span> : null}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer select-none hover:text-navy-900">View as table</summary>
        <div className="table-scroll mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="py-1 pr-4 font-semibold">Date</th>
                {lines.map((line) => (
                  <th key={line.id} className="py-1 pr-4 text-right font-semibold">
                    {line.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular text-slate-700">
              {[...days].reverse().map((ms) => (
                <tr key={ms} className="border-t border-slate-100">
                  <td className="py-1 pr-4">{DAY_LONG.format(new Date(ms))}</td>
                  {lines.map((line) => {
                    const index = atOrBefore(line.pts, ms);
                    const point = index >= 0 && line.pts[index].ms === ms ? line.pts[index] : null;
                    return (
                      <td key={line.id} className="py-1 pr-4 text-right">
                        {point ? formatValue(point.v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
