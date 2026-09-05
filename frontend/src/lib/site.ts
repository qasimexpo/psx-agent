/** Single source of truth for the public site URL and brand strings. */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.smartsarmaya.com"
).replace(/\/$/, "");

export const SITE_NAME = "SmartSarmaya";

export const SITE_DESCRIPTION =
  "Free AI research for the Pakistan Stock Exchange. Portfolio audits, stock analysis and halal picks screened against the KMI All Shares Islamic Index.";

export const CONTACT_EMAIL = "info@smartsarmaya.com";

/**
 * Social profiles. Empty entries are dropped, so the footer and the
 * Organization sameAs list stay correct while a profile does not exist yet.
 * Fill these in Vercel once each page is live.
 */
export const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: "X", href: process.env.NEXT_PUBLIC_SOCIAL_X ?? "" },
  { label: "Facebook", href: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK ?? "" },
  { label: "Instagram", href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM ?? "" },
  { label: "LinkedIn", href: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN ?? "" },
  { label: "Telegram", href: process.env.NEXT_PUBLIC_SOCIAL_TELEGRAM ?? "" },
].filter((link) => link.href.trim().length > 0);
