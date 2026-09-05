/** Single source of truth for the public site URL and brand strings. */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.smartsarmaya.com"
).replace(/\/$/, "");

export const SITE_NAME = "SmartSarmaya";

export const SITE_DESCRIPTION =
  "Free AI research for the Pakistan Stock Exchange. Portfolio audits, stock analysis and halal picks screened against the KMI All Shares Islamic Index.";

export const CONTACT_EMAIL = "info@smartsarmaya.com";
