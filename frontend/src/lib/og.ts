import { SITE_URL } from "@/lib/site";

/**
 * URLs for the share cards rendered by `/og`.
 *
 * Metadata takes the relative form, because `metadataBase` expands it. The
 * pipeline needs the absolute form, because Instagram fetches the image from
 * the public internet rather than being handed bytes.
 */

type OgTarget =
  | { type: "stock"; symbol: string }
  | { type: "brief"; date: string }
  | { type: "picks"; sector: string }
  | { type: "site" };

export function ogPath(target: OgTarget): string {
  switch (target.type) {
    case "stock":
      return `/og?type=stock&symbol=${encodeURIComponent(target.symbol)}`;
    case "brief":
      return `/og?type=brief&date=${encodeURIComponent(target.date)}`;
    case "picks":
      return `/og?type=picks&sector=${encodeURIComponent(target.sector)}`;
    default:
      return "/og";
  }
}

export function ogUrl(target: OgTarget): string {
  return `${SITE_URL}${ogPath(target)}`;
}

/** The image block shared by `openGraph` and `twitter` metadata. */
export function ogImages(target: OgTarget) {
  return [{ url: ogPath(target), width: 1200, height: 630 }];
}
