import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { searchSymbols } from "@/lib/db";

/** Symbol autocomplete, served straight from the database. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get("q") ?? "";
  if (term.trim().length < 1) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchSymbols(term, 8);
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
  );
}
