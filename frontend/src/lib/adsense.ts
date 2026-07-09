/** Normalize publisher ID to Google's ca-pub- format. */
export function getAdsenseClientId(): string {
  const raw = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() ?? "";
  if (!raw) return "";
  if (raw.startsWith("ca-pub-")) return raw;
  if (raw.startsWith("pub-")) return `ca-${raw}`;
  return `ca-pub-${raw}`;
}
