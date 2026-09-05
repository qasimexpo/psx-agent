import { NextResponse } from "next/server";
import { getEventsFor, getNews, getStock, isDatabaseConfigured } from "@/lib/db";
import { AiUnavailableError, completeJson, isAiConfigured } from "@/lib/ai";
import { STOCK_SYSTEM, stockUser } from "@/lib/prompts";
import { checkRateLimit, clientKey } from "@/lib/ratelimit";

/**
 * Single stock deep dive. Levels are derived from the stored technicals, never
 * from the model, and the symbol must already exist in the database.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_VERDICTS = new Set(["BUY MORE", "HOLD", "TRIM", "EXIT", "WATCH"]);

type ModelResponse = {
  verdict?: string;
  headline?: string;
  outlook?: string;
  positives?: string[];
  risks?: string[];
  shariah_note?: string;
};

function ruleVerdict(rsi: number | null, trend: string): string {
  if (rsi !== null && rsi <= 30) return "WATCH";
  if (rsi !== null && rsi >= 70) return "TRIM";
  if (trend.startsWith("Strong up")) return "HOLD";
  if (trend.startsWith("Strong down")) return "WATCH";
  return "HOLD";
}

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request.headers));
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.reason ?? "Rate limit reached." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Market data is not configured on this deployment." },
      { status: 503 },
    );
  }

  let symbol = "";
  try {
    const body = (await request.json()) as { symbol?: unknown };
    symbol = String(body.symbol ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!symbol || symbol.length > 12) {
    return NextResponse.json({ error: "Enter a valid PSX symbol." }, { status: 400 });
  }

  const stock = await getStock(symbol);
  if (!stock) {
    return NextResponse.json(
      { error: `${symbol} is not a PSX symbol we cover. Try searching for it above.` },
      { status: 404 },
    );
  }

  const [events, news] = await Promise.all([getEventsFor([symbol]), getNews(undefined, 6)]);

  const rangePosition =
    stock.low_52w && stock.high_52w && stock.high_52w > stock.low_52w
      ? ((stock.current_price - stock.low_52w) / (stock.high_52w - stock.low_52w)) * 100
      : null;

  const technicalsBlock = [
    `- Trend: ${stock.trend || "n/a"} (rules-based signal: ${stock.signal || "n/a"})`,
    `- RSI(14): ${stock.rsi_14 ?? "n/a"}`,
    `- Versus 50-day average: ${
      stock.sma_50 ? (stock.current_price > stock.sma_50 ? "above" : "below") : "n/a"
    }`,
    `- Versus 200-day average: ${
      stock.sma_200 ? (stock.current_price > stock.sma_200 ? "above" : "below") : "n/a"
    }`,
    `- Change: 1 week ${stock.change_1w_pct ?? "n/a"}%, 1 month ${stock.change_1m_pct ?? "n/a"}%, 1 year ${stock.change_1y_pct ?? "n/a"}%`,
    `- Position in 52-week range: ${rangePosition === null ? "n/a" : `${rangePosition.toFixed(0)}%`}`,
    `- 30-day average volume: ${stock.avg_volume_30d ?? "n/a"}`,
    `- Daily volatility: ${stock.volatility_pct ?? "n/a"}%`,
  ].join("\n");

  let model: ModelResponse = {};
  let aiAvailable = false;

  if (isAiConfigured()) {
    try {
      model = await completeJson<ModelResponse>(
        STOCK_SYSTEM,
        stockUser({
          symbol,
          name: stock.name || symbol,
          sector: stock.sector_name || "Unclassified",
          halalLabel: stock.is_kmi
            ? "Constituent of the KMI All Shares Islamic Index (Shariah compliant)"
            : "Not a KMI All Shares Islamic Index constituent",
          technicalsBlock,
          eventsBlock: events[symbol]?.join("; ") ?? "None scheduled.",
          newsBlock: news.length
            ? news.map((item) => `- ${item.title} (${item.source})`).join("\n")
            : "No headlines available.",
        }),
        1400,
      );
      aiAvailable = true;
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) {
        console.error("[analyze-stock] unexpected AI failure:", error);
      }
    }
  }

  // Levels come from stored technicals so the numbers are always defensible.
  const buyLow = stock.support ?? stock.current_price * 0.97;
  const target = stock.resistance ?? stock.current_price * 1.08;
  const verdictRaw = String(model.verdict ?? "").toUpperCase();
  const verdict = VALID_VERDICTS.has(verdictRaw)
    ? verdictRaw
    : ruleVerdict(stock.rsi_14, stock.trend);

  return NextResponse.json({
    symbol,
    name: stock.name || symbol,
    sector_name: stock.sector_name || "Unclassified",
    is_kmi: stock.is_kmi,
    current_price: stock.current_price,
    change_pct: stock.change_pct,
    verdict,
    headline: model.headline?.trim() || `${symbol} is in a ${(stock.trend || "neutral").toLowerCase()}.`,
    outlook:
      model.outlook?.trim() ||
      `${symbol} last traded at ${stock.current_price.toFixed(2)} with RSI ${
        stock.rsi_14 ?? "unavailable"
      } and a ${(stock.trend || "neutral").toLowerCase()}. AI commentary is temporarily unavailable, so this is the rules-based read of the stored technicals.`,
    positives: (model.positives ?? []).filter(Boolean).slice(0, 3),
    risks: (model.risks ?? []).filter(Boolean).slice(0, 3),
    shariah_note:
      model.shariah_note?.trim() ||
      (stock.is_kmi
        ? "Listed in the KMI All Shares Islamic Index, so the exchange treats it as Shariah compliant."
        : "Not in the KMI All Shares Islamic Index, so it does not pass the exchange's Shariah screen."),
    buy_zone: `${Math.min(buyLow, stock.current_price).toFixed(2)} - ${stock.current_price.toFixed(2)}`,
    exit_target: target.toFixed(2),
    support: stock.support,
    resistance: stock.resistance,
    rsi: stock.rsi_14,
    trend: stock.trend,
    ai_available: aiAvailable,
  });
}
