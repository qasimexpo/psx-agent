/** Types and fetch helpers shared by the interactive client components. */

export type ShareInput = {
  symbol: string;
  buy_price: number;
  quantity: number;
};

export type HoldingResult = {
  symbol: string;
  name: string;
  quantity: number;
  buy_price: number;
  live_price: number | null;
  invested: number;
  market_value: number;
  pl_pkr: number | null;
  pl_pct: number | null;
  weight_pct: number;
  is_kmi: boolean;
  sector_name: string;
  rsi: number | null;
  support: number | null;
  resistance: number | null;
  trend: string;
  action: string;
  reason: string;
  events: string[];
};

export type PortfolioResult = {
  report_date: string;
  verdict: string;
  risk_summary: string;
  shariah_note: string;
  next_steps: string[];
  holdings: HoldingResult[];
  totals: {
    invested: number;
    market_value: number;
    pl_pkr: number;
    pl_pct: number;
    halal_pct: number;
    top_sector: string;
    top_sector_pct: number;
  };
  ai_available: boolean;
};

export type StockResult = {
  symbol: string;
  name: string;
  sector_name: string;
  is_kmi: boolean;
  current_price: number;
  change_pct: number;
  verdict: string;
  headline: string;
  outlook: string;
  positives: string[];
  risks: string[];
  shariah_note: string;
  buy_zone: string;
  exit_target: string;
  support: number | null;
  resistance: number | null;
  rsi: number | null;
  trend: string;
  ai_available: boolean;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

export function analyzePortfolio(
  shares: ShareInput[],
  horizon: string,
): Promise<PortfolioResult> {
  return postJson<PortfolioResult>("/api/analyze-portfolio", { shares, horizon });
}

export function analyzeStock(symbol: string): Promise<StockResult> {
  return postJson<StockResult>("/api/analyze-stock", { symbol });
}

export type Suggestion = {
  symbol: string;
  name: string;
  sector_name: string;
  is_kmi: boolean;
};

export async function searchSymbols(term: string): Promise<Suggestion[]> {
  if (!term.trim()) return [];
  try {
    const response = await fetch(`/api/symbols?q=${encodeURIComponent(term)}`);
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: Suggestion[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}
