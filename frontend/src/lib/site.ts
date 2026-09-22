/** Single source of truth for the public site URL and brand strings. */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.smartsarmaya.com"
).replace(/\/$/, "");

export const SITE_NAME = "SmartSarmaya";

export const SITE_DESCRIPTION =
  "Free AI research for the Pakistan Stock Exchange. Portfolio audits, stock analysis and Shariah-compliant picks screened against the KMI All Shares Islamic Index.";

export const CONTACT_EMAIL = "info@smartsarmaya.com";

/**
 * The person responsible for what the site publishes. Finance is a topic
 * where search engines and readers both want a name behind the page; the
 * briefs and picks are written by a model, so the honest claim is editor,
 * not author. The bio is a placeholder to be replaced with the real one.
 */
export const EDITOR = {
  name: "Qasim Riaz",
  jobTitle: "Founder and editor",
  bio: "Builds and runs SmartSarmaya, sets the Shariah screening rules it follows, and answers for what it publishes. A retail investor on the Pakistan Stock Exchange.",
  url: `${SITE_URL}/about#editor`,
  id: `${SITE_URL}/#editor`,
} as const;

/**
 * Social profiles. Empty entries are dropped, so the footer and the
 * Organization sameAs list stay correct while a profile does not exist yet.
 * Fill these in Vercel once each page is live.
 */
export const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: "X", href: process.env.NEXT_PUBLIC_SOCIAL_X ?? "" },
  {
    label: "Facebook",
    // Compiled in, like the ad IDs: the Page exists, and an unset variable
    // would silently drop the one off-site profile the brand has.
    href:
      process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK ??
      "https://www.facebook.com/people/SmartSarmaya/61594631101238/",
  },
  { label: "Instagram", href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM ?? "" },
  { label: "LinkedIn", href: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN ?? "" },
  { label: "Telegram", href: process.env.NEXT_PUBLIC_SOCIAL_TELEGRAM ?? "" },
].filter((link) => link.href.trim().length > 0);
