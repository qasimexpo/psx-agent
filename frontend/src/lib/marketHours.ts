/**
 * PSX trading hours, for labelling how fresh prices are. Kept framework free so
 * server and client agree.
 *
 * The exchange trades Monday to Friday, 09:30-15:30 Pakistan time, which is
 * also when the pipeline's market job runs (every 30 minutes). Pakistan keeps
 * UTC+5 all year, so a fixed offset is exact. Holidays are not modelled here:
 * on a holiday no sync arrives, and the freshness check reports the prices as
 * possibly delayed rather than claiming they are live.
 */

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const OPEN_MINUTE = 9 * 60 + 30;
const CLOSE_MINUTE = 15 * 60 + 30;

/** Today's date in Pakistan, YYYY-MM-DD: the exchange's calendar day. */
export function todayPkt(now: number = Date.now()): string {
  return new Date(now + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** A sync this recent, during trading hours, counts as live. */
export const LIVE_WINDOW_MINUTES = 45;

export function inTradingHours(at: Date): boolean {
  const pkt = new Date(at.getTime() + PKT_OFFSET_MS);
  const day = pkt.getUTCDay();
  const minute = pkt.getUTCHours() * 60 + pkt.getUTCMinutes();
  return day >= 1 && day <= 5 && minute >= OPEN_MINUTE && minute < CLOSE_MINUTE;
}

const SYNC_TIME = new Intl.DateTimeFormat("en-PK", {
  timeZone: "Asia/Karachi",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "22 Oct, 3:05 pm" in Pakistan time, identical on server and client. */
export function formatSyncTime(iso: string): string {
  return `${SYNC_TIME.format(new Date(iso))} PKT`;
}

/**
 * The same for any timestamp a page renders, or "—". Cached pages use this
 * instead of "5 min ago": a relative time is frozen when the page is built
 * and grows wrong for as long as the cache lasts; an exact time stays true.
 */
export function formatPkt(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? "—" : `${SYNC_TIME.format(at)} PKT`;
}
