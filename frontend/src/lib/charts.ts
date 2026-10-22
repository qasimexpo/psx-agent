/**
 * Chart data helpers. Framework free, so server components prepare series and
 * client components slice them with the same code.
 */

export type PricePoint = { t: string; v: number; vol?: number };

/** Plot margins shared by stacked charts, so a volume panel lines up under its price chart. */
export const CHART_MARGIN = { top: 12, right: 84, bottom: 26, left: 60 } as const;

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

export type TradeStep = { symbol: string; side: "buy" | "sell"; quantity: number; trade_date: string };

/**
 * The portfolio's value on each past day.
 *
 * Share counts follow the recorded trades: a buy counts from its trade date,
 * a sell stops counting then. Shares held with no trades behind them (saved
 * before trades existed, or entered as a position) count throughout, so with
 * no trades at all this is simply what today's shares were worth each day.
 * Cash is not tracked, so a sale lowers the line. A symbol with no price
 * history counts at today's value throughout.
 */
export function holdingsValueSeries(
  holdings: { symbol: string; quantity: number; value: number }[],
  histories: Record<string, PricePoint[]>,
  trades: TradeStep[] = [],
): PricePoint[] {
  const current = new Map(holdings.map((h) => [h.symbol, h.quantity]));
  const symbols = [...new Set([...holdings.map((h) => h.symbol), ...trades.map((t) => t.symbol)])];
  const tracked = symbols.filter((symbol) => (histories[symbol]?.length ?? 0) > 0);
  const constant = holdings
    .filter((h) => !tracked.includes(h.symbol))
    .reduce((sum, h) => sum + h.value, 0);
  if (!tracked.length) return [];

  const steps = new Map(
    tracked.map((symbol) => {
      const own = trades
        .filter((t) => t.symbol === symbol)
        .map((t) => ({ day: t.trade_date, delta: t.side === "buy" ? t.quantity : -t.quantity }))
        .sort((a, b) => a.day.localeCompare(b.day));
      const net = own.reduce((sum, step) => sum + step.delta, 0);
      return [symbol, { opening: Math.max(0, (current.get(symbol) ?? 0) - net), own }];
    }),
  );

  const days = [...new Set(tracked.flatMap((symbol) => histories[symbol].map((p) => p.t)))].sort();
  const priceAt = new Map<string, number>(tracked.map((symbol) => [symbol, 0]));
  const stepAt = new Map<string, number>(tracked.map((symbol) => [symbol, 0]));
  const shares = new Map<string, number>(tracked.map((symbol) => [symbol, steps.get(symbol)!.opening]));

  const series = days.map((day) => {
    let total = constant;
    for (const symbol of tracked) {
      const closes = histories[symbol];
      let p = priceAt.get(symbol) ?? 0;
      while (p + 1 < closes.length && closes[p + 1].t <= day) p += 1;
      priceAt.set(symbol, p);

      const { own } = steps.get(symbol)!;
      let s = stepAt.get(symbol) ?? 0;
      let held = shares.get(symbol) ?? 0;
      while (s < own.length && own[s].day <= day) held += own[s++].delta;
      stepAt.set(symbol, s);
      shares.set(symbol, held);

      // Before a symbol's first close, its first close stands in.
      total += Math.max(0, held) * closes[p].v;
    }
    return { t: day, v: total };
  });
  // Days before anything was held carry no information.
  const first = series.findIndex((point) => point.v > 0);
  return first < 0 ? [] : series.slice(first);
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
