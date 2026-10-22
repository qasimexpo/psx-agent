"use server";

import { revalidatePath } from "next/cache";

import { AiUnavailableError, completeJson, isAiConfigured } from "@/lib/ai";
import { getSessionUser } from "@/lib/auth/server";
import {
  MAX_HOLDINGS,
  MAX_PRICE,
  MAX_QUANTITY,
  addHolding,
  countHoldings,
  holdsSymbol,
  knownSymbols,
} from "@/lib/portfolio";
import { checkRateLimit } from "@/lib/ratelimit";

/**
 * Broker statement import. The PDF is read in the browser; only its text,
 * with long numbers and email addresses already removed there, reaches this
 * action. The model only proposes rows: every symbol is checked against the
 * exchange's list and the visitor reviews the rows before anything is saved.
 */

export type Candidate = {
  symbol: string;
  name: string;
  quantity: number;
  /** From the statement when it shows one; otherwise null and the form suggests the price. */
  avg_cost: number | null;
  price: number | null;
};

export type ExtractResult = { candidates?: Candidate[]; unknown?: string[]; error?: string };

const MAX_TEXT = 16_000;
const SYMBOL = /^[A-Z0-9.-]{1,20}$/;

const SYSTEM = `You read text copied from a Pakistani stockbroker or CDC account statement and list the shares currently held.
Reply with JSON only, in this shape: {"holdings":[{"symbol":"OGDC","quantity":500,"avg_cost":245.5}]}
- symbol: the Pakistan Stock Exchange ticker in capitals, such as OGDC, HBL or LUCK. If only the company name appears, give its PSX ticker.
- quantity: shares currently held (the closing or current balance), as a whole number.
- avg_cost: the average buy price per share in rupees if the statement shows it, otherwise null.
Ignore cash balances, totals, fees, dividends and individual transactions. If no holdings are listed, reply {"holdings":[]}.`;

type ModelReply = { holdings?: { symbol?: unknown; quantity?: unknown; avg_cost?: unknown }[] };

export async function extractHoldingsAction(text: string): Promise<ExtractResult> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session has ended. Sign in again to continue." };
  if (!isAiConfigured()) return { error: "Statement import is not available right now." };
  const limit = checkRateLimit(`import:${user.id}`);
  if (!limit.ok) return { error: `Too many imports. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` };

  const clean = String(text ?? "").slice(0, MAX_TEXT).trim();
  if (clean.length < 20) return { error: "No readable text was found in that PDF. Scanned statements cannot be read yet." };

  let reply: ModelReply;
  try {
    reply = await completeJson<ModelReply>(SYSTEM, clean, 1600);
  } catch (error) {
    console.error("[import] model failed:", error instanceof AiUnavailableError ? error.message : error);
    return { error: "We could not read that statement just now. Please try again in a minute." };
  }

  const merged = new Map<string, { quantity: number; avg_cost: number | null }>();
  for (const row of reply.holdings ?? []) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const quantity = Math.round(Number(row.quantity));
    const cost = Number(row.avg_cost);
    if (!SYMBOL.test(symbol) || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) continue;
    const previous = merged.get(symbol);
    merged.set(symbol, {
      quantity: (previous?.quantity ?? 0) + quantity,
      avg_cost: Number.isFinite(cost) && cost > 0 && cost <= MAX_PRICE ? cost : previous?.avg_cost ?? null,
    });
  }

  const known = await knownSymbols([...merged.keys()]).catch(() => new Map());
  const candidates: Candidate[] = [];
  const unknown: string[] = [];
  for (const [symbol, row] of merged) {
    const listing = known.get(symbol);
    if (!listing) {
      unknown.push(symbol);
      continue;
    }
    candidates.push({ symbol, name: listing.name, quantity: row.quantity, avg_cost: row.avg_cost, price: listing.price });
  }
  if (!candidates.length && !unknown.length) return { error: "No share holdings were found in that statement." };
  return { candidates: candidates.slice(0, MAX_HOLDINGS), unknown };
}

export async function importHoldingsAction(
  rows: { symbol: string; quantity: number; price: number }[],
): Promise<{ ok?: string; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session has ended. Sign in again to continue." };

  const valid = (Array.isArray(rows) ? rows : []).filter(
    (row) =>
      SYMBOL.test(String(row.symbol)) &&
      Number.isInteger(row.quantity) &&
      row.quantity > 0 &&
      row.quantity <= MAX_QUANTITY &&
      Number.isFinite(row.price) &&
      row.price > 0 &&
      row.price <= MAX_PRICE,
  );
  if (!valid.length) return { error: "Choose at least one row with shares and a price above zero." };

  let added = 0;
  try {
    let room = MAX_HOLDINGS - (await countHoldings(user.id));
    for (const row of valid) {
      // A symbol already held merges into its position and takes no new slot.
      const isNew = !(await holdsSymbol(user.id, row.symbol));
      if (isNew && room <= 0) continue;
      // Imported rows are positions, not trades: the statement does not say when they were bought.
      if (await addHolding(user.id, row.symbol, row.quantity, Math.round(row.price * 100) / 100)) {
        added += 1;
        if (isNew) room -= 1;
      }
    }
  } catch (error) {
    console.error("[import] save failed:", error instanceof Error ? error.message : error);
    return { error: "Something went wrong saving those holdings. Please try again." };
  }
  revalidatePath("/portfolio");
  return added
    ? { ok: `Added ${added} holding${added > 1 ? "s" : ""} to your portfolio.` }
    : { error: `Nothing was added: a portfolio can hold up to ${MAX_HOLDINGS} stocks.` };
}
