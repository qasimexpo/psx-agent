import type { PricePoint } from "@/lib/charts";
import { percent } from "@/lib/format";

/**
 * Direction tones for single-series charts. Green and red are hard to tell
 * apart with red-green colour blindness, so a direction is never shown by
 * colour alone: every use pairs it with an arrow and a signed number.
 */
export const UP = "#059669"; // emerald-600
export const DOWN = "#e11d48"; // rose-600

export function toneColor(value: number | null): string {
  return value !== null && value < 0 ? DOWN : UP;
}

/** ▲ +4.20% / ▼ -1.30%, in text colours that clear contrast on white. */
export function Delta({
  value,
  suffix,
  className = "",
}: {
  value: number | null;
  suffix?: string;
  className?: string;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={`tabular text-slate-500 ${className}`}>—</span>;
  }
  const tone = value > 0 ? "text-emerald-700" : value < 0 ? "text-rose-600" : "text-slate-500";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "■";
  return (
    <span className={`tabular whitespace-nowrap font-semibold ${tone} ${className}`}>
      <span aria-hidden className="mr-0.5 text-[0.75em]">
        {arrow}
      </span>
      {percent(value)}
      {suffix ? <span className="ml-1 font-normal text-slate-500">{suffix}</span> : null}
    </span>
  );
}

/**
 * A small trend line for a table row. It sits beside its own signed change,
 * so it needs no axis or hover; the title gives the same in words.
 */
export function MiniTrend({
  points,
  change,
  caption,
  width = 96,
  height = 32,
}: {
  points: PricePoint[];
  change: number | null;
  caption: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <span className="text-xs text-slate-400">No history yet</span>;
  }
  const pad = 4;
  const values = points.map((p) => p.v);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const coords = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    height - pad - ((v - low) / span) * (height - pad * 2),
  ]);
  const path = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const [endX, endY] = coords[coords.length - 1];
  const color = toneColor(change);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={caption}>
      <title>{caption}</title>
      <path
        d={`${path}L${endX.toFixed(1)},${height - pad}L${pad},${height - pad}Z`}
        fill={color}
        fillOpacity={0.1}
      />
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={endX} cy={endY} r={2.5} fill={color} stroke="#ffffff" strokeWidth={1.5} />
    </svg>
  );
}
