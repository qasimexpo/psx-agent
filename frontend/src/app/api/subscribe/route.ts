import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/db";
import { checkRateLimit, clientKey } from "@/lib/ratelimit";
import { cleanSource, normaliseEmail, subscribe } from "@/lib/subscribers";

/**
 * Newsletter signup.
 *
 * The one endpoint on the site that writes what a visitor typed, so it is the
 * one that has to assume bad faith: the shared rate limiter, a honeypot field
 * that only a bot fills in, a size cap on the body, and validation before the
 * address reaches the database. The reply never distinguishes a new address
 * from one already on the list, because that difference would turn this into
 * an oracle for checking whether somebody is subscribed.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2_000;

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request.headers));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many signups from this connection. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "The newsletter is not available on this deployment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return NextResponse.json({ error: "Request too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;

  // Bots fill in every field they find. A human never sees this one.
  if (typeof payload.company === "string" && payload.company.trim().length > 0) {
    return NextResponse.json({ ok: true, message: "You are on the list." });
  }

  const email = normaliseEmail(typeof payload.email === "string" ? payload.email : "");
  if (!email) {
    return NextResponse.json(
      { error: "That does not look like an email address." },
      { status: 400 },
    );
  }

  try {
    await subscribe(email, cleanSource(typeof payload.source === "string" ? payload.source : ""));
  } catch (error) {
    console.error("[subscribe] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not save your address. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: "You are on the list." });
}
