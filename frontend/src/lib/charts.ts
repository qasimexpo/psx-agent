/**
 * Chart data helpers. Framework free, so server components prepare series and
 * client components slice them with the same code.
 */

export type PricePoint = { t: string; v: number };

export const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "6M", days: 183 },
  { key: "1Y", days: 366 },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

const DAY_MS = 86_400_000;

export function toMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** The points within `range` of the series' last day. */
export function sliceRange(points: PricePoint[], range: RangeKey): PricePoint[] {
  if (!points.length) return points;
  const days = RANGES.find((item) => item.key === range)?.days ?? 92;
  const cutoff = toMs(points[points.length - 1].t) - days * DAY_MS;
  return points.filter((point) => toMs(point.t) >= cutoff);
}

/** Percent change from the first point to the last, or null with fewer than two. */
export function changePct(points: PricePoint[]): number | null {
  if (points.length < 2 || points[0].v === 0) return null;
  return ((points[points.length - 1].v - points[0].v) / points[0].v) * 100;
}

/** Each value as percent change from the first, for comparing series on one axis. */
export function indexToStart(points: PricePoint[]): PricePoint[] {
  const base = points[0]?.v;
  if (!base) return [];
  return points.map((point) => ({ t: point.t, v: (point.v / base - 1) * 100 }));
}

/**
 * The daily closes plus today's live quote. History is written once a day
 * after the close, so during trading hours the last close is yesterday's.
 */
export function withLatest(
  points: PricePoint[],
  price: number | null,
  quoteAt: string | null,
): PricePoint[] {
  if (!price || price <= 0 || !quoteAt) return points;
  const day = new Date(Date.parse(quoteAt) + 5 * 3_600_000).toISOString().slice(0, 10); // PKT
  const last = points[points.length - 1];
  if (!last || day > last.t) return [...points, { t: day, v: price }];
  if (day === last.t) return [...points.slice(0, -1), { t: day, v: price }];
  return points;
}

/**
 * What the shares held today were worth on each past day. It is not the
 * account's history, which would need every past trade; it answers "how have
 * the stocks I own moved". A symbol with no history counts at a constant value
 * so the total still ends at today's market value.
 */
export function holdingsValueSeries(
  holdings: { symbol: string; quantity: number; value: number }[],
  histories: Record<string, PricePoint[]>,
): PricePoint[] {
  const tracked = holdings.filter((h) => (histories[h.symbol]?.length ?? 0) > 0);
  const constant = holdings
    .filter((h) => !tracked.includes(h))
    .reduce((sum, h) => sum + h.value, 0);
  if (!tracked.length) return [];

  const days = [...new Set(tracked.flatMap((h) => histories[h.symbol].map((p) => p.t)))].sort();
  const cursor = new Map<string, number>(tracked.map((h) => [h.symbol, 0]));

  return days.map((day) => {
    let total = constant;
    for (const holding of tracked) {
      const series = histories[holding.symbol];
      let index = cursor.get(holding.symbol) ?? 0;
      while (index + 1 < series.length && series[index + 1].t <= day) index += 1;
      cursor.set(holding.symbol, index);
      // Before a symbol's first close, its first close stands in.
      total += holding.quantity * series[index].v;
    }
    return { t: day, v: total };
  });
}

export type Slice = { label: string; value: number; other?: boolean };

/**
 * The largest slices, with the tail folded into one "Other" so a donut never
 * has more than `max` segments; past six, slices get too thin to compare.
 */
export function foldSlices(items: Slice[], max = 6): Slice[] {
  const sorted = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const rest = sorted.slice(max - 1);
  return [
    ...sorted.slice(0, max - 1),
    {
      label: `Other (${rest.length})`,
      value: rest.reduce((sum, item) => sum + item.value, 0),
      other: true,
    },
  ];
}

/** Round axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}
