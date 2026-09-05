import "server-only";

import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

/**
 * Read-only access to the database the Python pipeline writes.
 *
 * Server components call these directly, so a page view is one indexed SELECT
 * with no API server in between. Every function degrades to an empty result
 * when DATABASE_URL is absent, which keeps `next build` working in CI and on a
 * fresh clone.
 *
 * Two drivers are supported. A Neon host uses their HTTP driver, which is what
 * production runs on. Any other Postgres host uses node-postgres, so the site
 * can be run locally against a plain Postgres instance without a Neon account.
 */

const connectionString = process.env.DATABASE_URL ?? "";
const isNeonHost = /\.neon\.(tech|build)/.test(connectionString);

type Row = Record<string, unknown>;

const neonSql = connectionString && isNeonHost ? neon(connectionString) : null;

// Pooled across hot reloads in development, otherwise every edit leaks a pool.
const globalForPg = globalThis as unknown as { smartsarmayaPool?: Pool };

function getPool(): Pool | null {
  if (!connectionString || isNeonHost) return null;
  if (!globalForPg.smartsarmayaPool) {
    globalForPg.smartsarmayaPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 20_000,
      // Local Postgres normally has no TLS; hosted providers usually require it.
      ssl: /localhost|127\.0\.0\.1/.test(connectionString)
        ? undefined
        : { rejectUnauthorized: false },
    });
  }
  return globalForPg.smartsarmayaPool;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(connectionString);
}

/** Turn a tagged template into a numbered parameter query for node-postgres. */
function toParameterised(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce(
    (acc, part, index) => acc + part + (index < values.length ? `$${index + 1}` : ""),
    "",
  );
}

async function runQuery<T>(
  strings: TemplateStringsArray,
  values: unknown[],
): Promise<T[]> {
  if (neonSql) {
    return (await neonSql(strings, ...values)) as T[];
  }
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(toParameterised(strings, values), values);
  return result.rows as T[];
}

/**
 * A failed read degrades to an empty result so one bad section cannot take the
 * page down. Neon's HTTP endpoint occasionally fails to connect on the first
 * try, and an empty section is indistinguishable from missing data, so a
 * transient failure is retried once before giving up.
 */
async function query<T = Row>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runQuery<T>(strings, values);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        message.includes("fetch failed") ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("EAI_AGAIN");

      if (attempt === 0 && transient) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      console.error("[db] query failed:", message);
      return [];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------
export type Quote = {
  symbol: string;
  name: string;
  sector_code: string;
  sector_name: string;
  is_kmi: boolean;
  is_kse100: boolean;
  current_price: number;
  change: number;
  change_pct: number;
  volume: number;
  high: number | null;
  low: number | null;
};

export type StockDetail = Quote & {
  is_kmi30: boolean;
  ldcp: number | null;
  open: number | null;
  rsi_14: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  support: number | null;
  resistance: number | null;
  high_52w: number | null;
  low_52w: number | null;
  change_1w_pct: number | null;
  change_1m_pct: number | null;
  change_3m_pct: number | null;
  change_1y_pct: number | null;
  volatility_pct: number | null;
  avg_volume_30d: number | null;
  trend: string;
  signal: string;
  quote_at: string | null;
  tech_at: string | null;
};

export type StockNote = {
  symbol: string;
  headline: string;
  overview: string;
  bull_case: string;
  bear_case: string;
  verdict: string;
  updated_at: string;
};

export type IndexSnapshot = {
  name: string;
  day: string;
  value: number;
  change: number;
  change_pct: number;
  sparkline: number[];
};

export type Mover = {
  kind: string;
  rank: number;
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
  volume: number;
  is_kmi: boolean;
};

export type Pick = {
  symbol: string;
  name?: string;
  sector: string;
  summary: string;
  why: string;
  risk?: string;
  current_price: string;
  buy_zone: string;
  exit_target: string;
  rsi?: number | null;
  trend?: string | null;
  signal?: string | null;
  halal_verified?: boolean;
};

export type PicksResult = {
  picks: Pick[];
  pickDate: string | null;
};

export type PayoutRow = {
  symbol: string;
  company: string;
  payout: string;
  book_closure_from: string | null;
  book_closure_to: string | null;
  is_kmi: boolean;
};

export type EventRow = {
  symbol: string;
  company: string;
  event_type: string;
  event_date: string | null;
  event_time: string;
  city: string;
  is_kmi: boolean;
};

export type NewsRow = {
  region: string;
  title: string;
  snippet: string;
  source: string;
  link: string;
};

export type BriefRow = {
  brief_date: string;
  session: string;
  headline: string;
  summary: string;
  body_html: string;
  key_points: string[];
  symbols: string[];
  index_value: number | null;
  index_change_pct: number | null;
};

export type Scorecard = {
  total: number;
  winners: number;
  hit_rate: number;
  avg_return: number;
  targets_hit: number;
};

export type TrackedPick = {
  symbol: string;
  timeframe: string;
  sector: string;
  entry_date: string;
  entry_price: number;
  last_price: number;
  return_pct: number;
  days_held: number;
  hit_target: boolean;
  status: string;
};

export type SectorStat = {
  sector_code: string;
  sector_name: string;
  advance: number;
  decline: number;
  turnover: number;
  market_cap_bn: number;
};

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const maybeNum = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Normalise a DATE column to a plain `YYYY-MM-DD` string.
 *
 * Both drivers hand back a JavaScript Date for date columns, and stringifying
 * one yields "Sat Sep 05 2026 00:00:00 GMT+0500 (Pakistan Standard Time)".
 * That form silently broke every /brief/<date> URL and the sitemap, so every
 * date leaving this module goes through here.
 */
function toIsoDay(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    // Use the local date parts: the column is a calendar day, not an instant,
    // and converting through UTC can shift it backwards.
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const maybeIsoDay = (value: unknown): string | null => (value ? toIsoDay(value) : null);

export async function getTickerQuotes(limit = 40): Promise<Quote[]> {
  const rows = await query<Row>`
    SELECT symbol, name, sector_code, sector_name, is_kmi, is_kse100,
           current_price, change, change_pct, volume, high, low
    FROM stocks
    WHERE is_kse100 = true AND current_price > 0
    ORDER BY volume DESC
    LIMIT ${limit}
  `;
  return rows.map(toQuote);
}

function toQuote(row: Row): Quote {
  return {
    symbol: String(row.symbol),
    name: String(row.name ?? ""),
    sector_code: String(row.sector_code ?? ""),
    sector_name: String(row.sector_name ?? ""),
    is_kmi: Boolean(row.is_kmi),
    is_kse100: Boolean(row.is_kse100),
    current_price: num(row.current_price),
    change: num(row.change),
    change_pct: num(row.change_pct),
    volume: num(row.volume),
    high: maybeNum(row.high),
    low: maybeNum(row.low),
  };
}

export async function getIndexSnapshot(name = "KSE100"): Promise<IndexSnapshot | null> {
  const rows = await query<Row>`
    SELECT name, day, value, change, change_pct, sparkline
    FROM market_index
    WHERE name = ${name}
    ORDER BY day DESC
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0];
  const spark = Array.isArray(row.sparkline) ? (row.sparkline as unknown[]).map(num) : [];
  return {
    name: String(row.name),
    day: toIsoDay(row.day),
    value: num(row.value),
    change: num(row.change),
    change_pct: num(row.change_pct),
    sparkline: spark,
  };
}

export async function getIndexHistory(name = "KSE100", days = 90): Promise<{ day: string; value: number }[]> {
  const rows = await query<Row>`
    SELECT day, value FROM market_index
    WHERE name = ${name} AND value > 0
    ORDER BY day DESC
    LIMIT ${days}
  `;
  return rows.map((row) => ({ day: toIsoDay(row.day), value: num(row.value) })).reverse();
}

export async function getMovers(kind: string, limit = 5): Promise<Mover[]> {
  const rows = await query<Row>`
    SELECT kind, rank, symbol, name, price, change_pct, volume, is_kmi
    FROM movers WHERE kind = ${kind}
    ORDER BY rank ASC LIMIT ${limit}
  `;
  return rows.map((row) => ({
    kind: String(row.kind),
    rank: num(row.rank),
    symbol: String(row.symbol),
    name: String(row.name ?? ""),
    price: num(row.price),
    change_pct: num(row.change_pct),
    volume: num(row.volume),
    is_kmi: Boolean(row.is_kmi),
  }));
}

/**
 * Latest picks for one sector and horizon. "All" merges the newest row from
 * every sector, deduplicated by symbol.
 */
export async function getTopPicks(
  timeframe: string,
  sector: string,
  limit = 12,
): Promise<PicksResult> {
  if (sector && sector !== "All") {
    const rows = await query<Row>`
      SELECT ai_response_json, pick_date FROM top_picks
      WHERE timeframe = ${timeframe} AND sector = ${sector}
      ORDER BY pick_date DESC LIMIT 1
    `;
    if (!rows.length) return { picks: [], pickDate: null };
    const payload = rows[0].ai_response_json as { picks?: Pick[] } | null;
    return {
      picks: (payload?.picks ?? []).slice(0, limit),
      pickDate: toIsoDay(rows[0].pick_date),
    };
  }

  const rows = await query<Row>`
    SELECT DISTINCT ON (sector) sector, ai_response_json, pick_date
    FROM top_picks
    WHERE timeframe = ${timeframe}
    ORDER BY sector, pick_date DESC
  `;

  const seen = new Set<string>();
  const picks: Pick[] = [];
  let latest: string | null = null;

  for (const row of rows) {
    const date = toIsoDay(row.pick_date);
    if (!latest || date > latest) latest = date;
    const payload = row.ai_response_json as { picks?: Pick[] } | null;
    for (const pick of payload?.picks ?? []) {
      if (seen.has(pick.symbol)) continue;
      seen.add(pick.symbol);
      picks.push(pick);
    }
  }

  return { picks: picks.slice(0, limit), pickDate: latest };
}

export async function getUpcomingPayouts(limit = 20): Promise<PayoutRow[]> {
  const rows = await query<Row>`
    SELECT symbol, company, payout, book_closure_from, book_closure_to, is_kmi
    FROM payouts
    WHERE book_closure_from IS NOT NULL AND book_closure_from >= CURRENT_DATE - 2
    ORDER BY book_closure_from ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    symbol: String(row.symbol),
    company: String(row.company ?? ""),
    payout: String(row.payout ?? ""),
    book_closure_from: maybeIsoDay(row.book_closure_from),
    book_closure_to: maybeIsoDay(row.book_closure_to),
    is_kmi: Boolean(row.is_kmi),
  }));
}

export async function getUpcomingEvents(limit = 20): Promise<EventRow[]> {
  const rows = await query<Row>`
    SELECT symbol, company, event_type, event_date, event_time, city, is_kmi
    FROM corporate_events
    WHERE event_date IS NOT NULL AND event_date >= CURRENT_DATE
    ORDER BY event_date ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    symbol: String(row.symbol),
    company: String(row.company ?? ""),
    event_type: String(row.event_type ?? ""),
    event_date: maybeIsoDay(row.event_date),
    event_time: String(row.event_time ?? ""),
    city: String(row.city ?? ""),
    is_kmi: Boolean(row.is_kmi),
  }));
}

export async function getNews(region?: string, limit = 8): Promise<NewsRow[]> {
  const rows = region
    ? await query<Row>`
        SELECT region, title, snippet, source, link FROM news_items
        WHERE region = ${region} ORDER BY id ASC LIMIT ${limit}
      `
    : await query<Row>`
        SELECT region, title, snippet, source, link FROM news_items
        ORDER BY id ASC LIMIT ${limit}
      `;
  return rows.map((row) => ({
    region: String(row.region),
    title: String(row.title ?? ""),
    snippet: String(row.snippet ?? ""),
    source: String(row.source ?? ""),
    link: String(row.link ?? ""),
  }));
}

export async function getLatestBrief(): Promise<BriefRow | null> {
  const rows = await query<Row>`
    SELECT brief_date, session, headline, summary, body_html, key_points,
           symbols, index_value, index_change_pct
    FROM daily_briefs
    ORDER BY brief_date DESC, CASE WHEN session = 'closing' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  return rows.length ? toBrief(rows[0]) : null;
}

export async function getBriefByDate(date: string, session?: string): Promise<BriefRow | null> {
  const rows = session
    ? await query<Row>`
        SELECT brief_date, session, headline, summary, body_html, key_points,
               symbols, index_value, index_change_pct
        FROM daily_briefs WHERE brief_date = ${date} AND session = ${session} LIMIT 1
      `
    : await query<Row>`
        SELECT brief_date, session, headline, summary, body_html, key_points,
               symbols, index_value, index_change_pct
        FROM daily_briefs WHERE brief_date = ${date}
        ORDER BY CASE WHEN session = 'closing' THEN 0 ELSE 1 END LIMIT 1
      `;
  return rows.length ? toBrief(rows[0]) : null;
}

export async function listBriefs(limit = 30): Promise<BriefRow[]> {
  const rows = await query<Row>`
    SELECT brief_date, session, headline, summary, body_html, key_points,
           symbols, index_value, index_change_pct
    FROM daily_briefs
    ORDER BY brief_date DESC, CASE WHEN session = 'closing' THEN 0 ELSE 1 END
    LIMIT ${limit}
  `;
  return rows.map(toBrief);
}

function toBrief(row: Row): BriefRow {
  return {
    brief_date: toIsoDay(row.brief_date),
    session: String(row.session),
    headline: String(row.headline ?? ""),
    summary: String(row.summary ?? ""),
    body_html: String(row.body_html ?? ""),
    key_points: Array.isArray(row.key_points) ? (row.key_points as string[]) : [],
    symbols: Array.isArray(row.symbols) ? (row.symbols as string[]) : [],
    index_value: maybeNum(row.index_value),
    index_change_pct: maybeNum(row.index_change_pct),
  };
}

export async function getStock(symbol: string): Promise<StockDetail | null> {
  const rows = await query<Row>`
    SELECT * FROM stocks WHERE symbol = ${symbol.toUpperCase()} LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    ...toQuote(row),
    is_kmi30: Boolean(row.is_kmi30),
    ldcp: maybeNum(row.ldcp),
    open: maybeNum(row.open),
    rsi_14: maybeNum(row.rsi_14),
    sma_20: maybeNum(row.sma_20),
    sma_50: maybeNum(row.sma_50),
    sma_200: maybeNum(row.sma_200),
    support: maybeNum(row.support),
    resistance: maybeNum(row.resistance),
    high_52w: maybeNum(row.high_52w),
    low_52w: maybeNum(row.low_52w),
    change_1w_pct: maybeNum(row.change_1w_pct),
    change_1m_pct: maybeNum(row.change_1m_pct),
    change_3m_pct: maybeNum(row.change_3m_pct),
    change_1y_pct: maybeNum(row.change_1y_pct),
    volatility_pct: maybeNum(row.volatility_pct),
    avg_volume_30d: maybeNum(row.avg_volume_30d),
    trend: String(row.trend ?? ""),
    signal: String(row.signal ?? ""),
    quote_at: row.quote_at ? String(row.quote_at) : null,
    tech_at: row.tech_at ? String(row.tech_at) : null,
  };
}

export async function getStockNote(symbol: string): Promise<StockNote | null> {
  const rows = await query<Row>`
    SELECT symbol, headline, overview, bull_case, bear_case, verdict, updated_at
    FROM stock_notes WHERE symbol = ${symbol.toUpperCase()} LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    symbol: String(row.symbol),
    headline: String(row.headline ?? ""),
    overview: String(row.overview ?? ""),
    bull_case: String(row.bull_case ?? ""),
    bear_case: String(row.bear_case ?? ""),
    verdict: String(row.verdict ?? ""),
    updated_at: String(row.updated_at),
  };
}

/** Symbols that should get their own indexable page. */
export async function listIndexableSymbols(limit = 400): Promise<
  { symbol: string; name: string; sector_name: string; is_kmi: boolean; current_price: number; change_pct: number }[]
> {
  const rows = await query<Row>`
    SELECT symbol, name, sector_name, is_kmi, current_price, change_pct
    FROM stocks
    WHERE current_price > 0 AND is_debt = false AND is_etf = false
      AND (is_kse100 = true OR is_kmi = true)
    ORDER BY is_kse100 DESC, volume DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    symbol: String(row.symbol),
    name: String(row.name ?? ""),
    sector_name: String(row.sector_name ?? ""),
    is_kmi: Boolean(row.is_kmi),
    current_price: num(row.current_price),
    change_pct: num(row.change_pct),
  }));
}

/**
 * Other companies in the same PSX sector. Programmatic pages fail to index
 * mainly because nothing links to them, so every stock page links out to its
 * neighbours.
 */
export async function listSectorPeers(
  symbol: string,
  sectorCode: string,
  limit = 6,
): Promise<Quote[]> {
  if (!sectorCode) return [];
  const rows = await query<Row>`
    SELECT symbol, name, sector_code, sector_name, is_kmi, is_kse100,
           current_price, change, change_pct, volume, high, low
    FROM stocks
    WHERE sector_code = ${sectorCode}
      AND symbol <> ${symbol.toUpperCase()}
      AND current_price > 0 AND is_debt = false AND is_etf = false
    ORDER BY volume DESC
    LIMIT ${limit}
  `;
  return rows.map(toQuote);
}

export async function getScorecard(): Promise<Scorecard> {
  const rows = await query<Row>`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE return_pct > 0)::int AS winners,
           COALESCE(AVG(return_pct), 0) AS avg_return,
           COUNT(*) FILTER (WHERE hit_target)::int AS targets_hit
    FROM pick_track
  `;
  if (!rows.length) return { total: 0, winners: 0, hit_rate: 0, avg_return: 0, targets_hit: 0 };
  const row = rows[0];
  const total = num(row.total);
  const winners = num(row.winners);
  return {
    total,
    winners,
    hit_rate: total ? Math.round((winners / total) * 1000) / 10 : 0,
    avg_return: Math.round(num(row.avg_return) * 100) / 100,
    targets_hit: num(row.targets_hit),
  };
}

export async function getTrackedPicks(limit = 40): Promise<TrackedPick[]> {
  const rows = await query<Row>`
    SELECT symbol, timeframe, sector, entry_date, entry_price, last_price,
           return_pct, days_held, hit_target, status
    FROM pick_track
    ORDER BY entry_date DESC, return_pct DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    symbol: String(row.symbol),
    timeframe: String(row.timeframe),
    sector: String(row.sector),
    entry_date: toIsoDay(row.entry_date),
    entry_price: num(row.entry_price),
    last_price: num(row.last_price),
    return_pct: num(row.return_pct),
    days_held: num(row.days_held),
    hit_target: Boolean(row.hit_target),
    status: String(row.status),
  }));
}

export async function getSectorStats(limit = 12): Promise<SectorStat[]> {
  const rows = await query<Row>`
    SELECT sector_code, sector_name, advance, decline, turnover, market_cap_bn
    FROM sector_stats
    WHERE turnover > 0
    ORDER BY turnover DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    sector_code: String(row.sector_code),
    sector_name: String(row.sector_name ?? ""),
    advance: num(row.advance),
    decline: num(row.decline),
    turnover: num(row.turnover),
    market_cap_bn: num(row.market_cap_bn),
  }));
}

export async function getMarketStats(): Promise<{
  total: number;
  halal: number;
  updatedAt: string | null;
}> {
  const rows = await query<Row>`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_kmi)::int AS halal,
           MAX(quote_at) AS updated_at
    FROM stocks WHERE current_price > 0
  `;
  if (!rows.length) return { total: 0, halal: 0, updatedAt: null };
  return {
    total: num(rows[0].total),
    halal: num(rows[0].halal),
    updatedAt: rows[0].updated_at ? String(rows[0].updated_at) : null,
  };
}

/** Prices and technicals for the interactive analysis endpoints. */
export async function getQuotesFor(symbols: string[]): Promise<StockDetail[]> {
  if (!symbols.length) return [];
  const upper = symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  if (!upper.length) return [];
  const rows = await query<Row>`
    SELECT * FROM stocks WHERE symbol = ANY(${upper})
  `;
  return rows.map((row) => ({
    ...toQuote(row),
    is_kmi30: Boolean(row.is_kmi30),
    ldcp: maybeNum(row.ldcp),
    open: maybeNum(row.open),
    rsi_14: maybeNum(row.rsi_14),
    sma_20: maybeNum(row.sma_20),
    sma_50: maybeNum(row.sma_50),
    sma_200: maybeNum(row.sma_200),
    support: maybeNum(row.support),
    resistance: maybeNum(row.resistance),
    high_52w: maybeNum(row.high_52w),
    low_52w: maybeNum(row.low_52w),
    change_1w_pct: maybeNum(row.change_1w_pct),
    change_1m_pct: maybeNum(row.change_1m_pct),
    change_3m_pct: maybeNum(row.change_3m_pct),
    change_1y_pct: maybeNum(row.change_1y_pct),
    volatility_pct: maybeNum(row.volatility_pct),
    avg_volume_30d: maybeNum(row.avg_volume_30d),
    trend: String(row.trend ?? ""),
    signal: String(row.signal ?? ""),
    quote_at: row.quote_at ? String(row.quote_at) : null,
    tech_at: row.tech_at ? String(row.tech_at) : null,
  }));
}

export async function searchSymbols(term: string, limit = 8): Promise<
  { symbol: string; name: string; sector_name: string; is_kmi: boolean }[]
> {
  const trimmed = term.trim().toUpperCase();
  if (!trimmed) return [];
  const pattern = `${trimmed}%`;
  const contains = `%${trimmed}%`;
  const rows = await query<Row>`
    SELECT symbol, name, sector_name, is_kmi FROM stocks
    WHERE current_price > 0 AND is_debt = false
      AND (symbol LIKE ${pattern} OR UPPER(name) LIKE ${contains})
    ORDER BY (symbol LIKE ${pattern}) DESC, volume DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    symbol: String(row.symbol),
    name: String(row.name ?? ""),
    sector_name: String(row.sector_name ?? ""),
    is_kmi: Boolean(row.is_kmi),
  }));
}

export async function getEventsFor(symbols: string[]): Promise<Record<string, string[]>> {
  if (!symbols.length) return {};
  const upper = symbols.map((s) => s.toUpperCase());
  const payouts = await query<Row>`
    SELECT symbol, payout, book_closure_from FROM payouts
    WHERE symbol = ANY(${upper}) AND book_closure_from >= CURRENT_DATE
  `;
  const events = await query<Row>`
    SELECT symbol, event_type, event_date FROM corporate_events
    WHERE symbol = ANY(${upper}) AND event_date >= CURRENT_DATE
  `;
  const out: Record<string, string[]> = {};
  for (const row of payouts) {
    const symbol = String(row.symbol);
    out[symbol] = out[symbol] ?? [];
    out[symbol].push(`payout ${row.payout}, book closure ${toIsoDay(row.book_closure_from)}`);
  }
  for (const row of events) {
    const symbol = String(row.symbol);
    out[symbol] = out[symbol] ?? [];
    out[symbol].push(`${row.event_type} on ${toIsoDay(row.event_date)}`);
  }
  return out;
}
