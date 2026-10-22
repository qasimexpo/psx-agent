"use client";

import { useState } from "react";

import type { Slice } from "@/lib/charts";
import { pkr } from "@/lib/format";

/**
 * Part-to-whole at a glance, for at most six slices: the caller folds the
 * tail into "Other". Slices take the categorical slots in a fixed order with a
 * 2px surface gap between them, and the legend always names each slice with
 * its share and value, so nothing is read from colour or angle alone (three
 * slots sit under 3:1 contrast on white, which the visible legend relieves).
 * Hovering or focusing a slice or its legend row lifts that slice and shows
 * it in the centre.
 */

// Reference categorical slots 1-6, validated on white including the wrap-around
// pair (slot 6 sits next to slot 1 in a ring). OTHER replaces slot 6 when the
// tail is folded, and is validated against its neighbours, slots 5 and 1.
const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER = "#475569";

function arc(cx: number, cy: number, r: number, inner: number, start: number, end: number): string {
  const point = (radius: number, angle: number) =>
    `${(cx + radius * Math.sin(angle)).toFixed(2)},${(cy - radius * Math.cos(angle)).toFixed(2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M${point(r, start)}`,
    `A${r},${r} 0 ${large} 1 ${point(r, end)}`,
    `L${point(inner, end)}`,
    `A${inner},${inner} 0 ${large} 0 ${point(inner, start)}`,
    "Z",
  ].join("");
}

export default function Donut({
  title,
  slices,
  centerLabel,
}: {
  title: string;
  /** Rupee amounts; at most six, see foldSlices. */
  slices: Slice[];
  centerLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const size = 168;
  const r = size / 2;
  const inner = r - 26;
  const gap = 2 / r; // a 2px surface gap at the outer edge, in radians

  const sweeps = slices.map((slice) => (total > 0 ? (slice.value / total) * Math.PI * 2 : 0));
  const starts = sweeps.map((_, index) => sweeps.slice(0, index).reduce((sum, s) => sum + s, 0));
  const shapes = slices.map((slice, index) => {
    const halfGap = slices.length > 1 ? gap / 2 : 0;
    const start = starts[index] + halfGap;
    const end = starts[index] + sweeps[index] - halfGap;
    // foldSlices caps the ring at six, so every slice has its own slot.
    const color = slice.other ? OTHER : SLOTS[index];
    // A lone slice is a full ring, which one arc command cannot draw.
    const d =
      slices.length === 1
        ? `${arc(r, r, r, inner, 0, Math.PI)}${arc(r, r, r, inner, Math.PI, Math.PI * 2)}`
        : arc(r, r, r, inner, start, Math.max(start, end));
    return { slice, color, d, share: total > 0 ? (slice.value / total) * 100 : 0 };
  });

  const focused = active === null ? null : shapes[active];

  return (
    <div className="card p-5">
      <h2 className="text-base font-bold text-navy-900">{title}</h2>
      {!shapes.length ? (
        <p className="mt-3 text-sm text-slate-500">Nothing to show yet.</p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
              {shapes.map((shape, index) => (
                <path
                  key={shape.slice.label}
                  d={shape.d}
                  fill={shape.color}
                  opacity={active === null || active === index ? 1 : 0.35}
                  className="cursor-pointer transition-opacity"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                >
                  <title>{`${shape.slice.label}: ${shape.share.toFixed(1)}%, ${pkr(shape.slice.value)}`}</title>
                </path>
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              {focused ? (
                <>
                  <span className="text-lg font-bold text-navy-900">{focused.share.toFixed(1)}%</span>
                  <span className="max-w-[96px] truncate text-xs text-slate-500">{focused.slice.label}</span>
                </>
              ) : (
                <>
                  <span className="text-lg font-bold text-navy-900">{slices.length}</span>
                  <span className="text-xs text-slate-500">{centerLabel}</span>
                </>
              )}
            </div>
          </div>

          <ul className="w-full min-w-0 space-y-1">
            {shapes.map((shape, index) => (
              <li key={shape.slice.label}>
                <button
                  type="button"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className={`focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                    active === index ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: shape.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-navy-900">{shape.slice.label}</span>
                  <span className="tabular font-semibold text-navy-900">{shape.share.toFixed(1)}%</span>
                  <span className="tabular hidden w-28 text-right text-xs text-slate-500 sm:inline">
                    {pkr(shape.slice.value)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
