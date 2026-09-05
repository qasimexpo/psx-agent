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
 * Ad slots, read once so pages do not each reach into process.env.
 *
 * These default to the live units for the same reason the publisher ID does.
 * A slot ID is public: it is in the `data-ad-slot` attribute of every ad tag
 * the browser receives. Because `NEXT_PUBLIC_*` values are compiled in at
 * build time rather than read at runtime, an environment variable that is
 * missing, or merely scoped to Preview instead of Production, produces a build
 * with no ad units at all and no error anywhere. That is what happened on the
 * first deployment. Hard-coding the real units means the site always carries
 * inventory, and the environment variables still win where they are set.
 *
 * The article slot falls back to the bottom unit, so the stock, brief and
 * sector pages carry a unit before a dedicated in-article one is created.
 */
const DEFAULT_SLOT_TOP = "5906848623";
const DEFAULT_SLOT_BOTTOM = "8341440277";

const fromEnv = (value: string | undefined, fallback: string): string =>
  value?.trim() || fallback;

export const AD_SLOT_TOP = fromEnv(
  process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP,
  DEFAULT_SLOT_TOP,
);
export const AD_SLOT_BOTTOM = fromEnv(
  process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM,
  DEFAULT_SLOT_BOTTOM,
);
export const AD_SLOT_ARTICLE = fromEnv(
  process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE,
  AD_SLOT_BOTTOM,
);
