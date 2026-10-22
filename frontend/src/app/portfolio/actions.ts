"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/server";
import {
  MAX_HOLDINGS,
  MAX_PRICE,
  MAX_QUANTITY,
  addHolding,
  countHoldings,
  holdsSymbol,
  removeHolding,
  updateHolding,
} from "@/lib/portfolio";

/**
 * Portfolio changes. Each action re-reads the user from the verified session,
 * so a forged form can only ever touch the caller's own holdings.
 */

export type FormState = { error?: string; ok?: string };

const SESSION_ENDED = "Your session has ended. Sign in again to continue.";
const SAVE_FAILED = "Something went wrong saving that. Please try again.";
const SYMBOL = /^[A-Z0-9.-]{1,20}$/;

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

function readPosition(formData: FormData) {
  return {
    symbol: readSymbol(formData),
    quantity: readNumber(formData, "quantity", MAX_QUANTITY, true),
    price: readNumber(formData, "price", MAX_PRICE, false),
  };
}

export async function addHoldingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: SESSION_ENDED };

  const { symbol, quantity, price } = readPosition(formData);
  if (!symbol) return { error: "Choose a symbol from the list." };
  if (quantity === null) return { error: "Enter the number of shares as a whole number." };
  if (price === null) return { error: "Enter the price you paid per share, in rupees." };

  try {
    if ((await countHoldings(user.id)) >= MAX_HOLDINGS && !(await holdsSymbol(user.id, symbol))) {
      return { error: `A portfolio can hold up to ${MAX_HOLDINGS} different stocks.` };
    }
    if (!(await addHolding(user.id, symbol, quantity, price))) {
      return { error: `${symbol} is not a PSX symbol we have prices for.` };
    }
  } catch (error) {
    console.error("[portfolio] add failed:", error instanceof Error ? error.message : error);
    return { error: SAVE_FAILED };
  }

  revalidatePath("/portfolio");
  return { ok: `Added ${quantity.toLocaleString("en-PK")} ${symbol} shares.` };
}

export async function updateHoldingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: SESSION_ENDED };

  const { symbol, quantity, price } = readPosition(formData);
  if (!symbol || quantity === null || price === null) {
    return { error: "Enter whole shares and a price above zero." };
  }

  try {
    if (!(await updateHolding(user.id, symbol, quantity, price))) {
      return { error: `${symbol} is no longer in your portfolio.` };
    }
  } catch (error) {
    console.error("[portfolio] update failed:", error instanceof Error ? error.message : error);
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
