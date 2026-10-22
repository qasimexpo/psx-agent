import "server-only";

import { mutate, toIsoDay } from "./db";

/**
 * Profiles and holdings for signed-in users.
 *
 * Every statement takes the user id as its first value, and callers pass the
 * id from the verified session (`getSessionUser`), never from a form field, so
 * one user can never read or change another's portfolio. These use `mutate`,
 * which throws, even for reads: an empty portfolio shown because a query failed
 * would look like data loss, so the page reports the error instead.
 *
 * Prices are the same `stocks` quotes the rest of the site shows, refreshed by
 * the pipeline's market job during trading hours.
 */

export const MAX_HOLDINGS = 50;
export const MAX_QUANTITY = 100_000_000;
export const MAX_PRICE = 1_000_000;

type Row = Record<string, unknown>;

export type Position = {
  symbol: string;
  name: string;
  sector_name: string;
  is_kmi: boolean;
  quantity: number;
  avg_price: number;
  /** null when the exchange has no current quote for the symbol */
  price: number | null;
  change: number | null;
  change_pct: number | null;
  cost: number;
  value: number;
  pl: number | null;
  pl_pct: number | null;
  day_change: number | null;
  quote_at: string | null;
  /** When the position was first saved, for dividends on positions with no trades. */
  since: string | null;
};

export type PortfolioTotals = {
  cost: number;
  value: number;
  pl: number;
  pl_pct: number | null;
  day_change: number;
  day_change_pct: number | null;
  shariah_pct: number | null;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------

/** Creates the profile on first sign-in; a returning user's row is left alone. */
export async function ensureProfile(userId: string, displayName: string): Promise<void> {
  await mutate`
    INSERT INTO profiles (user_id, display_name, created_at, updated_at)
    VALUES (${userId}, ${displayName.slice(0, 80)}, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING
  `;
}

export async function getProfile(
  userId: string,
): Promise<{ display_name: string; created_at: string | null } | null> {
  const rows = await mutate<Row>`
    SELECT display_name, created_at FROM profiles WHERE user_id = ${userId}
  `;
  if (!rows.length) return null;
  return { display_name: String(rows[0].display_name ?? ""), created_at: iso(rows[0].created_at) };
}

export async function saveDisplayName(userId: string, displayName: string): Promise<void> {
  await mutate`
    INSERT INTO profiles (user_id, display_name, created_at, updated_at)
    VALUES (${userId}, ${displayName.slice(0, 80)}, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
  `;
}

/** Erases everything the site holds for a user. Used when they delete their account. */
export async function deleteUserData(userId: string): Promise<void> {
  await mutate`DELETE FROM holdings WHERE user_id = ${userId}`;
  await mutate`DELETE FROM trades WHERE user_id = ${userId}`;
  await mutate`DELETE FROM watchlist WHERE user_id = ${userId}`;
  await mutate`DELETE FROM price_alerts WHERE user_id = ${userId}`;
  await mutate`DELETE FROM profiles WHERE user_id = ${userId}`;
}

// ---------------------------------------------------------------------------
// holdings
// ---------------------------------------------------------------------------

export async function listPositions(userId: string): Promise<Position[]> {
  const rows = await mutate<Row>`
    SELECT h.symbol, h.quantity, h.avg_price, h.created_at,
           s.name, s.sector_name, s.is_kmi, s.current_price, s.change, s.change_pct, s.quote_at
    FROM holdings h
    LEFT JOIN stocks s ON s.symbol = h.symbol
    WHERE h.user_id = ${userId}
    ORDER BY h.symbol
  `;
  return rows.map((row) => {
    const quantity = num(row.quantity) ?? 0;
    const avgPrice = num(row.avg_price) ?? 0;
    const quoted = num(row.current_price);
    // A zero or missing quote means the exchange has none, not that the shares are worthless.
    const price = quoted !== null && quoted > 0 ? quoted : null;
    const change = price === null ? null : num(row.change);
    const cost = quantity * avgPrice;
    const value = price === null ? cost : quantity * price;
    const pl = price === null ? null : value - cost;
    return {
      symbol: String(row.symbol),
      name: String(row.name ?? ""),
      sector_name: String(row.sector_name ?? ""),
      is_kmi: Boolean(row.is_kmi),
      quantity,
      avg_price: avgPrice,
      price,
      change,
      change_pct: price === null ? null : num(row.change_pct),
      cost,
      value,
      pl,
      pl_pct: pl !== null && cost > 0 ? (pl / cost) * 100 : null,
      day_change: change === null ? null : quantity * change,
      quote_at: iso(row.quote_at),
      since: iso(row.created_at),
    };
  });
}

export function summarise(positions: Position[]): PortfolioTotals {
  const cost = positions.reduce((sum, p) => sum + p.cost, 0);
  const value = positions.reduce((sum, p) => sum + p.value, 0);
  const pl = positions.reduce((sum, p) => sum + (p.pl ?? 0), 0);
  const dayChange = positions.reduce((sum, p) => sum + (p.day_change ?? 0), 0);
  const halalValue = positions.filter((p) => p.is_kmi).reduce((sum, p) => sum + p.value, 0);
  const previousValue = value - dayChange;
  return {
    cost,
    value,
    pl,
    pl_pct: cost > 0 ? (pl / cost) * 100 : null,
    day_change: dayChange,
    day_change_pct: previousValue > 0 ? (dayChange / previousValue) * 100 : null,
    shariah_pct: value > 0 ? (halalValue / value) * 100 : null,
  };
}

export async function countHoldings(userId: string): Promise<number> {
  const rows = await mutate<Row>`
    SELECT count(*) AS total FROM holdings WHERE user_id = ${userId}
  `;
  return num(rows[0]?.total) ?? 0;
}

export async function holdsSymbol(userId: string, symbol: string): Promise<boolean> {
  const rows = await mutate<Row>`
    SELECT symbol FROM holdings WHERE user_id = ${userId} AND symbol = ${symbol}
  `;
  return rows.length > 0;
}

/**
 * Adds shares. Buying more of a symbol already held merges into one position at
 * the weighted average cost. Inserting through a SELECT on `stocks` means an
 * unknown symbol inserts nothing, so the returned list is empty and the caller
 * can say so. Postgres evaluates every SET expression against the old row, so
 * the average uses the quantity from before the update.
 */
export async function addHolding(
  userId: string,
  symbol: string,
  quantity: number,
  price: number,
): Promise<boolean> {
  const rows = await mutate<Row>`
    INSERT INTO holdings (user_id, symbol, quantity, avg_price, created_at, updated_at)
    SELECT ${userId}::text, symbol, ${quantity}::float8, ${price}::float8, NOW(), NOW()
    FROM stocks WHERE symbol = ${symbol}
    ON CONFLICT (user_id, symbol) DO UPDATE SET
      avg_price = (holdings.quantity * holdings.avg_price + EXCLUDED.quantity * EXCLUDED.avg_price)
                  / (holdings.quantity + EXCLUDED.quantity),
      quantity = holdings.quantity + EXCLUDED.quantity,
      updated_at = NOW()
    RETURNING symbol
  `;
  return rows.length > 0;
}

/** Replaces a position's share count and average cost, as when correcting a typo. */
export async function updateHolding(
  userId: string,
  symbol: string,
  quantity: number,
  price: number,
): Promise<boolean> {
  const rows = await mutate<Row>`
    UPDATE holdings SET quantity = ${quantity}, avg_price = ${price}, updated_at = NOW()
    WHERE user_id = ${userId} AND symbol = ${symbol}
    RETURNING symbol
  `;
  return rows.length > 0;
}

export async function removeHolding(userId: string, symbol: string): Promise<void> {
  await mutate`DELETE FROM holdings WHERE user_id = ${userId} AND symbol = ${symbol}`;
}

// ---------------------------------------------------------------------------
// trades
// ---------------------------------------------------------------------------

export type Trade = {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  trade_date: string;
  realized_pl: number | null;
};

/** A buy: merges into the position like addHolding, then logs the trade. */
export async function recordBuy(
  userId: string,
  symbol: string,
  quantity: number,
  price: number,
  tradeDate: string,
): Promise<boolean> {
  if (!(await addHolding(userId, symbol, quantity, price))) return false;
  await mutate`
    INSERT INTO trades (user_id, symbol, side, quantity, price, trade_date, realized_pl, created_at)
    VALUES (${userId}, ${symbol}, ${"buy"}, ${quantity}, ${price}, ${tradeDate}, NULL, NOW())
  `;
  return true;
}

export type SellOutcome =
  | { ok: true; realized: number }
  | { ok: false; held: number };

/**
 * A sell. The position is reduced in one conditional UPDATE, so two sells
 * racing can never take it below zero. Average cost does not change on a
 * sell; the profit realised is (sell price - average cost) x shares, stored
 * on the trade. A position sold to zero is removed.
 */
export async function recordSell(
  userId: string,
  symbol: string,
  quantity: number,
  price: number,
  tradeDate: string,
): Promise<SellOutcome> {
  const rows = await mutate<Row>`
    UPDATE holdings SET quantity = quantity - ${quantity}, updated_at = NOW()
    WHERE user_id = ${userId} AND symbol = ${symbol} AND quantity >= ${quantity}
    RETURNING avg_price, quantity
  `;
  if (!rows.length) {
    const held = await mutate<Row>`
      SELECT quantity FROM holdings WHERE user_id = ${userId} AND symbol = ${symbol}
    `;
    return { ok: false, held: num(held[0]?.quantity) ?? 0 };
  }
  const realized = Math.round((price - (num(rows[0].avg_price) ?? 0)) * quantity * 100) / 100;
  await mutate`
    INSERT INTO trades (user_id, symbol, side, quantity, price, trade_date, realized_pl, created_at)
    VALUES (${userId}, ${symbol}, ${"sell"}, ${quantity}, ${price}, ${tradeDate}, ${realized}, NOW())
  `;
  if ((num(rows[0].quantity) ?? 0) <= 0) {
    await mutate`DELETE FROM holdings WHERE user_id = ${userId} AND symbol = ${symbol} AND quantity <= 0`;
  }
  return { ok: true, realized };
}

/** Every trade, oldest first: the account-value chart and dividends need them all. */
export async function listTrades(userId: string): Promise<Trade[]> {
  const rows = await mutate<Row>`
    SELECT id, symbol, side, quantity, price, trade_date, realized_pl FROM trades
    WHERE user_id = ${userId}
    ORDER BY trade_date, id
  `;
  return rows.map((row) => ({
    id: num(row.id) ?? 0,
    symbol: String(row.symbol),
    side: row.side === "sell" ? "sell" : "buy",
    quantity: num(row.quantity) ?? 0,
    price: num(row.price) ?? 0,
    trade_date: toIsoDay(row.trade_date),
    realized_pl: num(row.realized_pl),
  }));
}

// ---------------------------------------------------------------------------
// watchlist
// ---------------------------------------------------------------------------

export const MAX_WATCHLIST = 50;

export type Watched = {
  symbol: string;
  name: string;
  is_kmi: boolean;
  price: number | null;
  change_pct: number | null;
  quote_at: string | null;
  high_52w: number | null;
  low_52w: number | null;
};

/** Follows a symbol. Like addHolding, an unknown symbol inserts nothing. */
export async function addWatch(userId: string, symbol: string): Promise<boolean> {
  const rows = await mutate<Row>`
    INSERT INTO watchlist (user_id, symbol, created_at)
    SELECT ${userId}::text, symbol, NOW() FROM stocks WHERE symbol = ${symbol}
    ON CONFLICT (user_id, symbol) DO NOTHING
    RETURNING symbol
  `;
  if (rows.length) return true;
  // Already followed is fine; only an unknown symbol is an error.
  const known = await mutate<Row>`SELECT symbol FROM stocks WHERE symbol = ${symbol}`;
  return known.length > 0;
}

export async function removeWatch(userId: string, symbol: string): Promise<void> {
  await mutate`DELETE FROM watchlist WHERE user_id = ${userId} AND symbol = ${symbol}`;
}

export async function countWatch(userId: string): Promise<number> {
  const rows = await mutate<Row>`SELECT count(*) AS total FROM watchlist WHERE user_id = ${userId}`;
  return num(rows[0]?.total) ?? 0;
}

export async function listWatch(userId: string): Promise<Watched[]> {
  const rows = await mutate<Row>`
    SELECT w.symbol, s.name, s.is_kmi, s.current_price, s.change_pct, s.quote_at,
           s.high_52w, s.low_52w
    FROM watchlist w
    LEFT JOIN stocks s ON s.symbol = w.symbol
    WHERE w.user_id = ${userId}
    ORDER BY w.created_at
  `;
  return rows.map((row) => {
    const quoted = num(row.current_price);
    return {
      symbol: String(row.symbol),
      name: String(row.name ?? ""),
      is_kmi: Boolean(row.is_kmi),
      price: quoted !== null && quoted > 0 ? quoted : null,
      change_pct: num(row.change_pct),
      quote_at: iso(row.quote_at),
      high_52w: num(row.high_52w),
      low_52w: num(row.low_52w),
    };
  });
}

// ---------------------------------------------------------------------------
// dividends
// ---------------------------------------------------------------------------

export type PayoutRecord = { symbol: string; payout: string; book_closure_from: string };

/** Payouts for these symbols: those already archived and those announced ahead. */
export async function listPayoutsFor(symbols: string[]): Promise<PayoutRecord[]> {
  if (!symbols.length) return [];
  const past = await mutate<Row>`
    SELECT symbol, payout, book_closure_from FROM payout_history WHERE symbol = ANY(${symbols})
  `;
  const ahead = await mutate<Row>`
    SELECT symbol, payout, book_closure_from FROM payouts
    WHERE symbol = ANY(${symbols}) AND book_closure_from IS NOT NULL
  `;
  const seen = new Set<string>();
  const out: PayoutRecord[] = [];
  for (const row of [...past, ...ahead]) {
    const record = {
      symbol: String(row.symbol),
      payout: String(row.payout ?? ""),
      book_closure_from: toIsoDay(row.book_closure_from),
    };
    const key = `${record.symbol}|${record.payout}|${record.book_closure_from}`;
    if (record.book_closure_from && !seen.has(key)) {
      seen.add(key);
      out.push(record);
    }
  }
  return out.sort((a, b) => a.book_closure_from.localeCompare(b.book_closure_from));
}

// ---------------------------------------------------------------------------
// price alerts
// ---------------------------------------------------------------------------

export const MAX_ALERTS = 20;

export type PriceAlert = {
  id: number;
  symbol: string;
  direction: "above" | "below";
  target: number;
  created_at: string | null;
  triggered_at: string | null;
  triggered_price: number | null;
  /** The latest quote, to show how far the price is from the target. */
  price: number | null;
};

/** Creates a one-shot alert. Like addHolding, an unknown symbol inserts nothing. */
export async function createAlert(
  userId: string,
  email: string,
  symbol: string,
  direction: "above" | "below",
  target: number,
): Promise<boolean> {
  const rows = await mutate<Row>`
    INSERT INTO price_alerts (user_id, email, symbol, direction, target, created_at)
    SELECT ${userId}::text, ${email}::text, symbol, ${direction}::text, ${target}::float8, NOW()
    FROM stocks WHERE symbol = ${symbol}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function countActiveAlerts(userId: string): Promise<number> {
  const rows = await mutate<Row>`
    SELECT count(*) AS total FROM price_alerts WHERE user_id = ${userId} AND triggered_at IS NULL
  `;
  return num(rows[0]?.total) ?? 0;
}

export async function listAlerts(userId: string): Promise<PriceAlert[]> {
  const rows = await mutate<Row>`
    SELECT a.id, a.symbol, a.direction, a.target, a.created_at, a.triggered_at, a.triggered_price,
           s.current_price
    FROM price_alerts a
    LEFT JOIN stocks s ON s.symbol = a.symbol
    WHERE a.user_id = ${userId}
    ORDER BY a.triggered_at DESC NULLS FIRST, a.created_at DESC
  `;
  return rows.map((row) => {
    const quoted = num(row.current_price);
    return {
      id: num(row.id) ?? 0,
      symbol: String(row.symbol),
      direction: row.direction === "below" ? "below" : "above",
      target: num(row.target) ?? 0,
      created_at: iso(row.created_at),
      triggered_at: iso(row.triggered_at),
      triggered_price: num(row.triggered_price),
      price: quoted !== null && quoted > 0 ? quoted : null,
    };
  });
}

export async function deleteAlert(userId: string, id: number): Promise<void> {
  await mutate`DELETE FROM price_alerts WHERE user_id = ${userId} AND id = ${id}`;
}

// ---------------------------------------------------------------------------
// statement import
// ---------------------------------------------------------------------------

/** Name and latest price for each listed symbol among `symbols`. */
export async function knownSymbols(
  symbols: string[],
): Promise<Map<string, { name: string; price: number | null }>> {
  if (!symbols.length) return new Map();
  const rows = await mutate<Row>`
    SELECT symbol, name, current_price FROM stocks WHERE symbol = ANY(${symbols})
  `;
  return new Map(
    rows.map((row) => {
      const quoted = num(row.current_price);
      return [String(row.symbol), { name: String(row.name ?? ""), price: quoted && quoted > 0 ? quoted : null }];
    }),
  );
}
