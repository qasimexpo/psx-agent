import "server-only";

/**
 * Best-effort rate limiting for the two AI endpoints.
 *
 * The site runs on free AI quotas, so an unthrottled public endpoint is a real
 * risk: a single script could exhaust the day's allowance in minutes. State
 * lives in the serverless instance's memory, which means limits are per
 * instance rather than global. That is deliberate: it costs nothing, adds no
 * failure mode, and stops casual abuse. The hard protections that do not
 * depend on memory are input validation and the requirement that every symbol
 * already exist in the database.
 */

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const DAILY_CAP = 400;

const buckets = new Map<string, Bucket>();
let dayStamp = new Date().toISOString().slice(0, 10);
let dailyCount = 0;

function sweep(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds: number;
  reason?: string;
};

export function checkRateLimit(identifier: string): RateLimitResult {
  const now = Date.now();

  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayStamp) {
    dayStamp = today;
    dailyCount = 0;
  }

  if (dailyCount >= DAILY_CAP) {
    return {
      ok: false,
      retryAfterSeconds: 3600,
      reason: "The free daily analysis limit has been reached. Please try again tomorrow.",
    };
  }

  sweep(now);
  const bucket = buckets.get(identifier);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    dailyCount += 1;
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_PER_WINDOW) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      reason: "Too many requests. Please wait a moment and try again.",
    };
  }

  bucket.count += 1;
  dailyCount += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/** Caller identity from proxy headers, falling back to a shared bucket. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "anonymous";
}
