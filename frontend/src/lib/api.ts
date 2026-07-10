export type Share = {
  symbol: string;
  buy_price: number;
  quantity: number;
};

export type HoldingRow = {
  symbol: string;
  quantity: number;
  buy_price: number;
  live_price: number | null;
  pl_pkr: number | null;
  rsi: number | null;
  ai_action: string;
};

export type AnalyzeResult = {
  report_html: string;
  report_date: string;
  holdings: HoldingRow[];
  risk_summary: string;
};

export type PickCard = {
  symbol: string;
  sector: string;
  summary: string;
  why: string;
  outlook_short: string;
  outlook_long: string;
  buy_zone: string;
  current_price: string;
  exit_target: string;
};

export type TopPicksResult = {
  report_html: string;
  daily_picks: PickCard[];
  monthly_picks: PickCard[];
  yearly_picks: PickCard[];
};

export type NewsItem = {
  title: string;
  snippet: string;
  source: string;
  link: string;
};

export type NewsResult = {
  pakistan: NewsItem[];
  global: NewsItem[];
};

export type PickHorizon = "daily" | "monthly" | "yearly";

export type MarketIndexResult = {
  name: string;
  value: number;
  change: number;
  change_pct: number;
  sparkline: number[];
};

export type SymbolSuggestion = {
  symbol: string;
  name: string;
  sector: string;
};

export type SingleStockAnalyzeResult = {
  symbol: string;
  current_price: string;
  target_price: string;
  weightage_recommendation: string;
  future_outlook: string;
  action: string;
};

export type MarketTickerItem = {
  symbol: string;
  current_price: number;
  high: number;
  low: number;
  change: number;
  direction: "UP" | "DOWN";
};

export type DividendCalendarItem = {
  symbol: string;
  event_type: string;
  details: string;
  date: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 15000;
const TICKER_TIMEOUT_MS = 45000;

async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data?.detail)) {
      return data.detail
        .map((item: { msg?: string }) => item.msg ?? "Validation error")
        .join(", ");
    }
  } catch {
    // ignore JSON parse errors
  }
  return `Request failed with status ${res.status}.`;
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out while waiting for live market data.");
    }
    throw new Error(
      `Cannot reach the analysis server. Make sure the FastAPI backend is running at ${API_URL}.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const message = await parseErrorResponse(res);
    if (res.status === 503) {
      throw new Error(
        message.includes("GROQ_API_KEY")
          ? "AI service unavailable — check GROQ_API_KEY on the server."
          : message,
      );
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export async function analyzePortfolio(shares: Share[]): Promise<AnalyzeResult> {
  return apiFetch<AnalyzeResult>("/analyze_portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shares }),
  });
}

export async function fetchTopPicks(): Promise<TopPicksResult> {
  return apiFetch<TopPicksResult>("/top_picks");
}

export async function fetchNews(): Promise<NewsResult> {
  return apiFetch<NewsResult>("/news");
}

export async function fetchMarketIndex(): Promise<MarketIndexResult> {
  return apiFetch<MarketIndexResult>("/market_index");
}

export async function searchSymbols(
  query: string,
  limit = 8,
): Promise<SymbolSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  const data = await apiFetch<{ results: SymbolSuggestion[] }>(
    `/symbols?${params.toString()}`,
  );
  return data.results;
}

export async function analyzeSingleStock(
  symbol: string,
): Promise<SingleStockAnalyzeResult> {
  return apiFetch<SingleStockAnalyzeResult>("/analyze_single_stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
}

export async function fetchMarketTicker(): Promise<MarketTickerItem[]> {
  return apiFetch<MarketTickerItem[]>("/market_ticker", undefined, TICKER_TIMEOUT_MS);
}

export async function fetchDividendCalendar(): Promise<DividendCalendarItem[]> {
  return apiFetch<DividendCalendarItem[]>("/dividend_calendar");
}
