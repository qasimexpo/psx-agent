/**
 * AdSense wiring.
 *
 * The publisher ID is not a secret - it is already public in /ads.txt and in
 * every ad tag on the page - so it falls back to the real account rather than
 * silently disabling ads when the Vercel environment variable is missing. A
 * missing ID means the AdSense script never loads at all, which is invisible
 * locally and fatal to a review.
 */

const DEFAULT_CLIENT = "ca-pub-7107292781644653";

/** Normalize publisher ID to Google's ca-pub- format. */
export function getAdsenseClientId(): string {
  const raw = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() ?? "";
  if (!raw) return DEFAULT_CLIENT;
  if (raw.startsWith("ca-pub-")) return raw;
  if (raw.startsWith("pub-")) return `ca-${raw}`;
  return `ca-pub-${raw}`;
}

/**
 * Ad slots, read once so pages do not each reach into process.env. The article
 * slot falls back to the bottom slot, so content pages carry a unit even
 * before a dedicated in-article unit exists in AdSense.
 */
export const AD_SLOT_TOP = process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP ?? "";
export const AD_SLOT_BOTTOM = process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM ?? "";
export const AD_SLOT_ARTICLE =
  process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE || AD_SLOT_BOTTOM;
