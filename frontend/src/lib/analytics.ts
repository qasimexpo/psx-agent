/**
 * Google Analytics events.
 *
 * gtag is loaded in the root layout. Everything here is a no-op when the
 * script has not loaded - an ad blocker, a bot, or local development without
 * NEXT_PUBLIC_GA_ID - so no call site needs to guard.
 */

type GtagParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (command: string, event: string, params?: GtagParams) => void;
  }
}

export function trackEvent(name: string, params: GtagParams = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params);
  } catch {
    // Analytics must never break a tool the visitor is using.
  }
}
