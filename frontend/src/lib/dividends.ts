/**
 * Dividend income from PSX payout announcements. Framework free.
 *
 * The exchange lists cash dividends as a percentage of face value, as in
 * "25%(F) (D)" or "7.50%(ii) (D)"; "(B)" is a bonus issue and "(R)" a rights
 * issue, which pay no cash. Face value is not in the data, so amounts assume
 * the common Rs 10 and the page says so.
 */

export const FACE_VALUE = 10;

export type TradeLike = { symbol: string; side: "buy" | "sell"; quantity: number; trade_date: string };
export type PositionLike = { symbol: string; quantity: number; since: string | null };
export type PayoutLike = { symbol: string; payout: string; book_closure_from: string };

/** The cash dividend as a percent of face value, or null for bonus, rights or unreadable text. */
export function cashDividendPct(payout: string): number | null {
  if (!/\(D\)/i.test(payout)) return null;
  const match = payout.match(/(\d+(?:\.\d+)?)\s*%/);
  const pct = match ? Number(match[1]) : NaN;
  return Number.isFinite(pct) && pct > 0 ? pct : null;
}

/**
 * Shares of `symbol` held going into `day` (trades on that day do not count:
 * a buy on the first day of book closure is too late for the payout).
 * A position saved without trades counts from the day it was saved.
 */
export function sharesHeldBefore(
  symbol: string,
  day: string,
  position: PositionLike | undefined,
  trades: TradeLike[],
): number {
  const own = trades.filter((t) => t.symbol === symbol);
  const current = position?.quantity ?? 0;
  if (!own.length) {
    const since = position?.since?.slice(0, 10);
    return since && since < day ? current : 0;
  }
  const net = own.reduce((sum, t) => sum + (t.side === "buy" ? t.quantity : -t.quantity), 0);
  const opening = Math.max(0, current - net);
  const moved = own
    .filter((t) => t.trade_date < day)
    .reduce((sum, t) => sum + (t.side === "buy" ? t.quantity : -t.quantity), 0);
  return Math.max(0, opening + moved);
}

export type DividendLine = {
  symbol: string;
  payout: string;
  day: string;
  status: "received" | "upcoming";
  perShare: number | null;
  shares: number;
  amount: number | null;
};

/**
 * One line per payout on a stock held at its book closure: received when the
 * book closure is past, upcoming otherwise (counted on today's position).
 */
export function dividendLines(
  payouts: PayoutLike[],
  positions: PositionLike[],
  trades: TradeLike[],
  today: string,
): DividendLine[] {
  const bySymbol = new Map(positions.map((p) => [p.symbol, p]));
  const lines: DividendLine[] = [];
  for (const payout of payouts) {
    const upcoming = payout.book_closure_from >= today;
    const position = bySymbol.get(payout.symbol);
    const shares = upcoming
      ? position?.quantity ?? 0
      : sharesHeldBefore(payout.symbol, payout.book_closure_from, position, trades);
    if (shares <= 0) continue;
    const pct = cashDividendPct(payout.payout);
    const perShare = pct === null ? null : (pct / 100) * FACE_VALUE;
    lines.push({
      symbol: payout.symbol,
      payout: payout.payout,
      day: payout.book_closure_from,
      status: upcoming ? "upcoming" : "received",
      perShare,
      shares,
      amount: perShare === null ? null : perShare * shares,
    });
  }
  return lines;
}
