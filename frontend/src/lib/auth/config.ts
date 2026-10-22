/**
 * Supabase Auth settings shared by the server, the proxy and the browser.
 *
 * The publishable key is public by design: it only identifies the project.
 * It grants nothing on the data tables, because the pipeline enables row
 * level security with no policies and revokes the API roles' grants on every
 * table (see `_close_rest_api` in pipeline/db.py). The site reads and writes
 * portfolios over its own Postgres connection, scoped to the verified user.
 *
 * When either value is missing, accounts are switched off and the pages that
 * need them say so, which keeps `next build` working in CI and on a fresh clone.
 */

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_PUBLISHABLE_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
).trim();

export function isAuthConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Where to send someone after signing in. Only a path on this site is
 * accepted, so a crafted `?next=` cannot bounce a fresh session to another
 * domain: "//evil.com" and "/\evil.com" are both protocol-relative URLs.
 */
export function safeNext(raw: string | null | undefined, fallback = "/portfolio"): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
