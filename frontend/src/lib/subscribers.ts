import "server-only";

import { randomBytes } from "node:crypto";

import { mutate } from "./db";

/**
 * Newsletter signups.
 *
 * Addresses are stored once, lower-cased, with the page the person signed up
 * from and the time they did it, because that is the evidence that consent was
 * given. Nothing here sends email: the pipeline owns sending, so a signup is
 * only ever a database write, and the site stays up whether or not a mailer is
 * configured.
 *
 * Every row carries a `confirm_token`, which is what a confirmation link and
 * an unsubscribe link both prove ownership with. Signing up again re-issues
 * the token while the address is unconfirmed, so an address can never be on
 * the list twice. A row is kept after unsubscribing rather than deleted, so a
 * later send cannot resurrect an address someone has already refused.
 */

export type SignupOutcome = "subscribed" | "already";

/**
 * Deliberately stricter than the RFC: one @, a dot in the domain, no spaces,
 * no leading or trailing dot. Rejects the typos people actually make without
 * pretending to validate deliverability, which only a send can do.
 */
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/;

const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
]);

export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  if (DISPOSABLE.has(email.slice(email.lastIndexOf("@") + 1))) return null;
  return email;
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** A signup's origin, for both analytics and the record of consent. */
export function cleanSource(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[^a-z0-9/_-]/gi, "").slice(0, 64);
}

/**
 * Adds an address, or revives one that had unsubscribed. One statement, so two
 * submissions racing cannot create two rows: the unique index on email decides
 * and the loser takes the update branch.
 *
 * Three cases, and the difference between them is about consent rather than
 * bookkeeping. An address nobody has confirmed yet gets a fresh token and the
 * newer source. An address that is already confirmed and active is left
 * completely alone, so someone typing a stranger's address cannot rotate that
 * person's token or change their record. An address that had unsubscribed is
 * revived as *unconfirmed*: the form alone is not proof that the owner asked
 * again, so nothing is sent until they click the link in the confirmation
 * email. Without that, anyone who knew an address could put it back on a list
 * its owner had already left.
 */
export async function subscribe(
  email: string,
  source: string,
): Promise<{ outcome: SignupOutcome; token: string }> {
  const rows = await mutate<{ confirmed_at: string | null; confirm_token: string }>`
    INSERT INTO subscribers (email, source, confirm_token, created_at)
    VALUES (${email}, ${source}, ${newToken()}, NOW())
    ON CONFLICT (email) DO UPDATE
       SET confirm_token = CASE
             WHEN subscribers.confirmed_at IS NULL OR subscribers.unsubscribed_at IS NOT NULL
             THEN EXCLUDED.confirm_token ELSE subscribers.confirm_token END,
           confirmed_at = CASE
             WHEN subscribers.unsubscribed_at IS NOT NULL
             THEN NULL ELSE subscribers.confirmed_at END,
           unsubscribed_at = NULL,
           source = CASE WHEN subscribers.confirmed_at IS NULL
                         THEN EXCLUDED.source ELSE subscribers.source END
    RETURNING confirmed_at, confirm_token
  `;
  const row = rows[0];
  return {
    outcome: row?.confirmed_at ? "already" : "subscribed",
    token: row?.confirm_token ?? "",
  };
}

/** Marks an address confirmed. Returns the address, or null for a bad token. */
export async function confirm(token: string): Promise<string | null> {
  if (!token || token.length > 64) return null;
  const rows = await mutate<{ email: string }>`
    UPDATE subscribers
       SET confirmed_at = COALESCE(confirmed_at, NOW()), unsubscribed_at = NULL
     WHERE confirm_token = ${token}
    RETURNING email
  `;
  return rows[0]?.email ?? null;
}

/** Whose address a token belongs to, without changing anything. */
export async function addressFor(token: string): Promise<string | null> {
  if (!token || token.length > 64) return null;
  const rows = await mutate<{ email: string }>`
    SELECT email FROM subscribers WHERE confirm_token = ${token} AND unsubscribed_at IS NULL
  `;
  return rows[0]?.email ?? null;
}

export async function unsubscribe(token: string): Promise<string | null> {
  if (!token || token.length > 64) return null;
  const rows = await mutate<{ email: string }>`
    UPDATE subscribers
       SET unsubscribed_at = COALESCE(unsubscribed_at, NOW())
     WHERE confirm_token = ${token}
    RETURNING email
  `;
  return rows[0]?.email ?? null;
}
