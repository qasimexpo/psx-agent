import { NextResponse } from "next/server";
import { getEventsFor, getNews, getQuotesFor, isDatabaseConfigured } from "@/lib/db";
import { AiUnavailableError, completeJson, isAiConfigured } from "@/lib/ai";
import { PORTFOLIO_SYSTEM, portfolioUser } from "@/lib/prompts";
import { checkRateLimit, clientKey } from "@/lib/ratelimit";

/**
 * Portfolio audit.
 *
 * Prices, profit and loss, weights and concentration are all computed here from
 * the database. The model receives finished numbers and writes only the
 * reasoning, so it cannot invent a price. If the model is unavailable the
 * numeric report is still returned, with a rules-based action per holding.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HOLDINGS = 8;

const HORIZON_LABEL: Record<string, string> = {
  short: "short term, 1 to 4 weeks",
  medium: "medium term, 1 to 6 months",
  long: "long term, a year or more",
};

type Body = {
  shares?: { symbol?: unknown; buy_price?: unknown; quantity?: unknown }[];
  horizon?: unknown;
};

type ModelAction = { symbol?: string; action?: string; reason?: string };
type ModelResponse = {
  verdict?: string;
  risk_summary?: string;
  actions?: ModelAction[];
  next_steps?: string[];
  shariah_note?: string;
};

const VALID_ACTIONS = new Set(["BUY MORE", "HOLD", "TRIM", "EXIT"]);

/** A transparent fallback so the tool still works when the AI quota is spent. */
function ruleAction(plPct: number | null, rsi: number | null, trend: string): string {
  if (plPct !== null && plPct <= -15) return "TRIM";
  if (rsi !== null && rsi >= 70) return "TRIM";
  if (rsi !== null && rsi <= 30 && trend.includes("trend")) return "BUY MORE";
  if (trend.startsWith("Strong down")) return "TRIM";
  if (trend.startsWith("Strong up") || trend === "Uptrend") return "HOLD";
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const raw = Array.isArray(body.shares) ? body.shares : [];
  if (!raw.length) {
    return NextResponse.json({ error: "Add at least one holding." }, { status: 400 });
  }
  if (raw.length > MAX_HOLDINGS) {
    return NextResponse.json(
      { error: `You can analyse up to ${MAX_HOLDINGS} holdings at a time.` },
      { status: 400 },
    );
  }

  const shares: { symbol: string; buyPrice: number; quantity: number }[] = [];
  for (const item of raw) {
    const symbol = String(item.symbol ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const buyPrice = Number(item.buy_price);
    const quantity = Number(item.quantity);
    if (!symbol || !Number.isFinite(buyPrice) || buyPrice <= 0) {
      return NextResponse.json({ error: `Enter a valid buy price for ${symbol || "each holding"}.` }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000_000) {
      return NextResponse.json({ error: `Enter a valid quantity for ${symbol}.` }, { status: 400 });
    }
    shares.push({ symbol, buyPrice, quantity });
  }

  const quotes = await getQuotesFor(shares.map((share) => share.symbol));
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const missing = shares.filter((share) => !bySymbol.has(share.symbol)).map((share) => share.symbol);
  if (missing.length === shares.length) {
    return NextResponse.json(
      { error: `Not listed on the PSX, or not covered yet: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  const horizon = String(body.horizon ?? "medium");
  const horizonLabel = HORIZON_LABEL[horizon] ?? HORIZON_LABEL.medium;

  const priced = shares
    .filter((share) => bySymbol.has(share.symbol))
    .map((share) => {
      const quote = bySymbol.get(share.symbol)!;
      const invested = share.buyPrice * share.quantity;
      const marketValue = quote.current_price * share.quantity;
      const pl = marketValue - invested;
      return {
        share,
        quote,
        invested,
        marketValue,
        pl,
        plPct: invested > 0 ? (pl / invested) * 100 : null,
      };
    });

  const totalInvested = priced.reduce((sum, row) => sum + row.invested, 0);
  const totalValue = priced.reduce((sum, row) => sum + row.marketValue, 0);
  const halalValue = priced
    .filter((row) => row.quote.is_kmi)
    .reduce((sum, row) => sum + row.marketValue, 0);

  const sectorTotals = new Map<string, number>();
  for (const row of priced) {
    const sector = row.quote.sector_name || "Unclassified";
    sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + row.marketValue);
  }
  const topSector = [...sectorTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];

  const events = await getEventsFor(priced.map((row) => row.share.symbol));
  const news = await getNews(undefined, 8);

  const holdingsBlock = priced
    .map((row) => {
      const q = row.quote;
      return [
        `- ${q.symbol} (${q.name || q.symbol}, ${q.sector_name || "Unclassified"})`,
        `holding ${row.share.quantity} at cost ${row.share.buyPrice.toFixed(2)}`,
        `live ${q.current_price.toFixed(2)}`,
        `P/L ${row.pl >= 0 ? "+" : ""}${row.pl.toFixed(0)} PKR (${row.plPct?.toFixed(1) ?? "n/a"}%)`,
        `weight ${totalValue > 0 ? ((row.marketValue / totalValue) * 100).toFixed(1) : "0"}%`,
        `RSI ${q.rsi_14 ?? "n/a"}`,
        `trend ${q.trend || "n/a"}`,
        `rule signal ${q.signal || "n/a"}`,
        `shariah ${q.is_kmi ? "compliant" : "NOT compliant"}`,
      ].join(", ");
    })
    .join("\n");

  const totalsBlock = [
    `Invested: ${totalInvested.toFixed(0)} PKR`,
    `Market value: ${totalValue.toFixed(0)} PKR`,
    `Unrealised P/L: ${(totalValue - totalInvested).toFixed(0)} PKR`,
    `Shariah compliant share of value: ${totalValue > 0 ? ((halalValue / totalValue) * 100).toFixed(0) : 0}%`,
    `Holdings: ${priced.length}`,
  ].join("\n");

  const sectorBlock = [...sectorTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([sector, value]) =>
        `- ${sector}: ${totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0"}% of value`,
    )
    .join("\n");

  const eventsBlock = Object.entries(events).length
    ? Object.entries(events)
        .map(([symbol, items]) => `- ${symbol}: ${items.join("; ")}`)
        .join("\n")
    : "None scheduled for these holdings.";

  const newsBlock = news.length
    ? news.map((item) => `- ${item.title} (${item.source})`).join("\n")
    : "No headlines available.";

  let model: ModelResponse = {};
  let aiAvailable = false;

  if (isAiConfigured()) {
    try {
      model = await completeJson<ModelResponse>(
        PORTFOLIO_SYSTEM,
        portfolioUser({
          reportDate: new Date().toLocaleDateString("en-PK", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Karachi",
          }),
          timeframeLabel: horizonLabel,
          holdingsBlock,
          totalsBlock,
          sectorBlock,
          eventsBlock,
          newsBlock,
        }),
        2000,
      );
      aiAvailable = true;
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) {
        console.error("[analyze-portfolio] unexpected AI failure:", error);
      }
    }
  }

  const actionBySymbol = new Map<string, ModelAction>();
  for (const action of model.actions ?? []) {
    const symbol = String(action.symbol ?? "").toUpperCase();
    if (symbol) actionBySymbol.set(symbol, action);
  }

  const holdings = priced.map((row) => {
    const q = row.quote;
    const fromModel = actionBySymbol.get(q.symbol);
    const modelAction = String(fromModel?.action ?? "").toUpperCase();
    const action = VALID_ACTIONS.has(modelAction)
      ? modelAction
      : ruleAction(row.plPct, q.rsi_14, q.trend);

    return {
      symbol: q.symbol,
      name: q.name,
      quantity: row.share.quantity,
      buy_price: row.share.buyPrice,
      live_price: q.current_price,
      invested: Math.round(row.invested),
      market_value: Math.round(row.marketValue),
      pl_pkr: Math.round(row.pl),
      pl_pct: row.plPct === null ? null : Math.round(row.plPct * 100) / 100,
      weight_pct: totalValue > 0 ? Math.round((row.marketValue / totalValue) * 1000) / 10 : 0,
      is_kmi: q.is_kmi,
      sector_name: q.sector_name || "Unclassified",
      rsi: q.rsi_14,
      support: q.support,
      resistance: q.resistance,
      trend: q.trend,
      action,
      reason:
        fromModel?.reason?.trim() ||
        `Rules-based call from trend (${q.trend || "unknown"}), RSI ${q.rsi_14 ?? "n/a"} and your ${
          row.plPct === null ? "position" : `${row.plPct.toFixed(1)}% position`
        }.`,
      events: events[q.symbol] ?? [],
    };
  });

  const halalPct = totalValue > 0 ? Math.round((halalValue / totalValue) * 100) : 0;

  return NextResponse.json({
    report_date: new Date().toLocaleDateString("en-PK", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Karachi",
    }),
    verdict:
      model.verdict?.trim() ||
      `${priced.length} holdings worth ${Math.round(totalValue).toLocaleString()} PKR, ${
        totalValue >= totalInvested ? "showing a gain" : "showing a loss"
      } against cost.`,
    risk_summary:
      model.risk_summary?.trim() ||
      `Largest concentration is ${topSector[0]} at ${
        totalValue > 0 ? Math.round((topSector[1] / totalValue) * 100) : 0
      }% of value. Concentration above 40% in one sector raises single-sector risk.`,
    shariah_note:
      model.shariah_note?.trim() ||
      `${halalPct}% of this portfolio's value sits in KMI All Shares Islamic Index constituents.`,
    next_steps: (model.next_steps ?? []).filter(Boolean).slice(0, 4),
    holdings,
    totals: {
      invested: Math.round(totalInvested),
      market_value: Math.round(totalValue),
      pl_pkr: Math.round(totalValue - totalInvested),
      pl_pct:
        totalInvested > 0
          ? Math.round(((totalValue - totalInvested) / totalInvested) * 10000) / 100
          : 0,
      halal_pct: halalPct,
      top_sector: topSector[0],
      top_sector_pct: totalValue > 0 ? Math.round((topSector[1] / totalValue) * 100) : 0,
    },
    ai_available: aiAvailable,
  });
}
