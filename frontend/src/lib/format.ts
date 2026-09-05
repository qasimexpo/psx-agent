/** Shared formatting helpers. Kept framework free so both server and client use them. */

const PKR = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COMPACT = new Intl.NumberFormat("en-PK", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return PKR.format(value);
}

export function pkr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `Rs ${PKR.format(value)}`;
}

export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return COMPACT.format(value);
}

export function percent(value: number | null | undefined, withSign = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function signedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}Rs ${PKR.format(Math.abs(value))}`;
}

export function toneOf(value: number | null | undefined): "up" | "down" | "flat" {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/** Colour classes for a change value, consistent across the whole site. */
export function changeClass(value: number | null | undefined): string {
  const tone = toneOf(value);
  if (tone === "up") return "text-emerald-600";
  if (tone === "down") return "text-rose-600";
  return "text-slate-500";
}

const DATE_FMT = new Intl.DateTimeFormat("en-PK", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Karachi",
});

const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-PK", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Karachi",
});

export function longDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return DATE_FMT.format(date);
}

export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return SHORT_DATE_FMT.format(date);
}

/** "3 minutes ago" style freshness label for data timestamps. */
export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "not yet updated";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "not yet updated";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Position of a price inside its 52 week range, as a 0-100 number. */
export function rangePosition(
  price: number | null,
  low: number | null,
  high: number | null,
): number | null {
  if (price === null || low === null || high === null || high <= low) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

export function parsePickPrice(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
