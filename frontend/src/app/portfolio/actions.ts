"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/server";
import { money, pkr, signedMoney } from "@/lib/format";
import { todayPkt } from "@/lib/marketHours";
import {
  MAX_ALERTS,
  MAX_HOLDINGS,
  MAX_PRICE,
  MAX_QUANTITY,
  MAX_WATCHLIST,
  addWatch,
  countActiveAlerts,
  countHoldings,
  createAlert,
  deleteAlert,
  countWatch,
  holdsSymbol,
  recordBuy,
  recordSell,
  removeHolding,
  removeWatch,
  updateHolding,
} from "@/lib/portfolio";

/**
 * Portfolio changes. Each action re-reads the user from the verified session,
 * so a forged form can only ever touch the caller's own portfolio.
 */

export type FormState = { error?: string; ok?: string };

const SESSION_ENDED = "Your session has ended. Sign in again to continue.";
const SAVE_FAILED = "Something went wrong saving that. Please try again.";
const SYMBOL = /^[A-Z0-9.-]{1,20}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function readSymbol(formData: FormData): string | null {
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  return SYMBOL.test(symbol) ? symbol : null;
}

function readNumber(
  formData: FormData,
  field: string,
  max: number,
  wholeNumber: boolean,
): number | null {
  const value = Number(String(formData.get(field) ?? "").trim());
  if (!Number.isFinite(value) || value <= 0 || value > max) return null;
  if (wholeNumber && !Number.isInteger(value)) return null;
  return wholeNumber ? value : Math.round(value * 100) / 100;
}

function readDay(formData: FormData): string | null {
  const day = String(formData.get("trade_date") ?? "").trim() || todayPkt();
  return DAY.test(day) && day >= "2000-01-01" && day <= todayPkt() ? day : null;
}

function log(what: string, error: unknown) {
  console.error(`[portfolio] ${what} failed:`, error instanceof Error ? error.message : error);
}

export async function tradeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: SESSION_ENDED };

  const side = formData.get("side") === "sell" ? "sell" : "buy";
  const symbol = readSymbol(formData);
  const quantity = readNumber(formData, "quantity", MAX_QUANTITY, true);
  const price = readNumber(formData, "price", MAX_PRICE, false);
  const day = readDay(formData);
  if (!symbol) return { error: "Choose a symbol from the list." };
  if (quantity === null) return { error: "Enter the number of shares as a whole number." };
  if (price === null) return { error: `Enter the price per share you ${side === "buy" ? "paid" : "sold at"}, in rupees.` };
  if (day === null) return { error: "Choose a trade date that is not in the future." };

  let message: string;
  try {
    if (side === "buy") {
      if ((await countHoldings(user.id)) >= MAX_HOLDINGS && !(await holdsSymbol(user.id, symbol))) {
        return { error: `A portfolio can hold up to ${MAX_HOLDINGS} different stocks.` };
      }
      if (!(await recordBuy(user.id, symbol, quantity, price, day))) {
        return { error: `${symbol} is not a PSX symbol we have prices for.` };
      }
      message = `Bought ${quantity.toLocaleString("en-PK")} ${symbol} at ${pkr(price)}.`;
    } else {
      const outcome = await recordSell(user.id, symbol, quantity, price, day);
      if (!outcome.ok) {
        return {
          error: outcome.held
            ? `You hold ${outcome.held.toLocaleString("en-PK")} ${symbol} shares, so you cannot sell ${quantity.toLocaleString("en-PK")}.`
            : `You do not hold any ${symbol}.`,
        };
      }
      message = `Sold ${quantity.toLocaleString("en-PK")} ${symbol} at ${money(price)}, realising ${signedMoney(outcome.realized)}.`;
    }
  } catch (error) {
    log("trade", error);
    return { error: SAVE_FAILED };
  }

  revalidatePath("/portfolio");
  return { ok: message };
}

export async function updateHoldingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: SESSION_ENDED };

  const symbol = readSymbol(formData);
  const quantity = readNumber(formData, "quantity", MAX_QUANTITY, true);
  const price = readNumber(formData, "price", MAX_PRICE, false);
  if (!symbol || quantity === null || price === null) {
    return { error: "Enter whole shares and a price above zero." };
  }

  try {
    if (!(await updateHolding(user.id, symbol, quantity, price))) {
      return { error: `${symbol} is no longer in your portfolio.` };
    }
  } catch (error) {
    log("update", error);
    return { error: SAVE_FAILED };
  }

  revalidatePath("/portfolio");
  return { ok: "Saved." };
}

export async function removeHoldingAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const symbol = readSymbol(formData);
  if (!user || !symbol) return;
  await removeHolding(user.id, symbol);
  revalidatePath("/portfolio");
}

export async function addWatchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: SESSION_ENDED };
  const symbol = readSymbol(formData);
  if (!symbol) return { error: "Choose a symbol from the list." };
  try {
    if ((await countWatch(user.id)) >= MAX_WATCHLIST) {
      return { error: `A watchlist can follow up to ${MAX_WATCHLIST} stocks.` };
    }
    if (!(await addWatch(user.id, symbol))) {
      return { error: `${symbol} is not a PSX symbol we have prices for.` };
    }
  } catch (error) {
    log("watch", error);
    return { error: SAVE_FAILED };
  }
  revalidatePath("/portfolio");
  return { ok: `Watching ${symbol}.` };
}

export async function removeWatchAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const symbol = readSymbol(formData);
  if (!user || !symbol) return;
  await removeWatch(user.id, symbol);
  revalidatePath("/portfolio");
}

/**
 * The Watch button on a stock page. That page is static and does not know
 * who is visiting, so a signed-out visitor is sent to sign in and back.
 */
export async function watchFromStockPage(_prev: FormState, formData: FormData): Promise<FormState> {
  const symbol = readSymbol(formData);
  if (!symbol) return { error: "Unknown symbol." };
  if (!(await getSessionUser())) redirect(`/login?next=${encodeURIComponent(`/stock/${symbol}`)}`);
  return addWatchAction(_prev, formData);
}

/** Whether the pipeline emails fired alerts; set ALERT_EMAILS=on once SMTP is configured there. */
function alertEmailsOn(): boolean {
  return (process.env.ALERT_EMAILS ?? "").trim().toLowerCase() === "on";
}

/**
 * Sets a price alert from a stock page. Like Watch, a signed-out visitor is
 * sent to sign in first. The alert carries the account's email, which is
 * where the pipeline sends it when it fires.
 */
export async function createAlertAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const symbol = readSymbol(formData);
  if (!symbol) return { error: "Unknown symbol." };
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/stock/${symbol}`)}`);

  const direction = formData.get("direction") === "below" ? "below" : "above";
  const target = readNumber(formData, "target", MAX_PRICE, false);
  if (target === null) return { error: "Enter a target price above zero." };
  try {
    if ((await countActiveAlerts(user.id)) >= MAX_ALERTS) {
      return { error: `You can have up to ${MAX_ALERTS} alerts waiting at once.` };
    }
    if (!(await createAlert(user.id, user.email, symbol, direction, target))) {
      return { error: `${symbol} is not a PSX symbol we have prices for.` };
    }
  } catch (error) {
    log("alert", error);
    return { error: SAVE_FAILED };
  }
  revalidatePath("/portfolio");
  return {
    ok: `Alert set: ${symbol} ${direction} ${pkr(target)}. ${
      alertEmailsOn() ? `We will email ${user.email} when it happens.` : "It will show on your portfolio when it happens."
    }`,
  };
}

export async function deleteAlertAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const id = Number(formData.get("id"));
  if (!user || !Number.isInteger(id) || id <= 0) return;
  await deleteAlert(user.id, id);
  revalidatePath("/portfolio");
}
