import { NextResponse, type NextRequest } from "next/server";

import { getPriceHistories } from "@/lib/db";

/**
 * A symbol's daily closes for the stock page chart.
 *
 * Served from the CDN cache rather than baked into each statically generated
 * stock page: the history changes once a day, and putting a year of points in
 * hundreds of pages would multiply the plan's ISR writes for no benefit.
 */
export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Z0-9.-]{1,20}$/;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol.trim().toUpperCase();
  if (!SYMBOL.test(symbol)) {
    return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  }
  const histories = await getPriceHistories([symbol]);
  return NextResponse.json(
    { symbol, points: histories[symbol] ?? [] },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
