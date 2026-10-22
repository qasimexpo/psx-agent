import { timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Marks every cached page stale; each rebuilds on its next visit.
 *
 * The pipeline calls this after a job writes new data. Pages otherwise keep
 * their cached copy, so outside PSX trading hours, when no job writes prices,
 * nothing is rebuilt at all. Requires the shared REVALIDATE_SECRET.
 */
export const dynamic = "force-dynamic";

function authorised(given: string | null): boolean {
  const expected = (process.env.REVALIDATE_SECRET ?? "").trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request.headers.get("x-revalidate-secret"))) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
