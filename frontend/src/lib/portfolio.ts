import "server-only";

import { mutate } from "./db";

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
  await mutate`DELETE FROM profiles WHERE user_id = ${userId}`;
}

// ---------------------------------------------------------------------------
// holdings
// ---------------------------------------------------------------------------

export async function listPositions(userId: string): Promise<Position[]> {
  const rows = await mutate<Row>`
    SELECT h.symbol, h.quantity, h.avg_price,
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
