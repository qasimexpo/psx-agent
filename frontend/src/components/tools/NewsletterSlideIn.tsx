"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import NewsletterSignup from "@/components/tools/NewsletterSignup";
import { trackEvent } from "@/lib/analytics";

/**
 * A signup card that slides up from the bottom once a visitor is engaged.
 *
 * Deliberately not a modal. Google treats an interstitial that covers the
 * content on mobile as an intrusive interstitial and demotes the page for it,
 * and search is where this site's visitors come from, so the card sits below
 * the content and never blocks it.
 *
 * It appears after the visitor has read something rather than on arrival, it
 * can be dismissed, and the dismissal is remembered. It also hides itself
 * whenever one of the page's own signup forms is on screen, so nobody is asked
 * twice in one view, and near the foot of the page, where the ad unit and the
 * footer live.
 */

const DISMISSED_KEY = "ss.newsletter.dismissed";
const SIGNED_UP_KEY = "ss.newsletter.done";
const QUIET_DAYS = 30;
const SCROLL_TRIGGER = 0.4; // of the scrollable height
const DWELL_MS = 30_000;
const FOOTER_ZONE = 1400; // px from the bottom where the card stays out of the way

/** localStorage throws in some private modes, and a prompt is never worth a crash. */
function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembering the dismissal is a smaller problem than an error.
  }
}

function suppressed(): boolean {
  if (readFlag(SIGNED_UP_KEY)) return true;
  const at = Number(readFlag(DISMISSED_KEY) ?? 0);
  return at > 0 && Date.now() - at < QUIET_DAYS * 86_400_000;
}

export default function NewsletterSlideIn() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const shown = useRef(false);
  const dismissed = useRef(false);

  // The newsletter's own pages, where a prompt to subscribe makes no sense.
  const offLimits = pathname?.startsWith("/newsletter") ?? false;

  const dismiss = useCallback(() => {
    setLeaving(true);
    dismissed.current = true;
    writeFlag(DISMISSED_KEY, String(Date.now()));
    trackEvent("newsletter_slidein_dismissed", { path: pathname ?? "" });
    window.setTimeout(() => setVisible(false), 200);
  }, [pathname]);

  useEffect(() => {
    if (offLimits || suppressed()) return;

    // An inline form on screen already asks the question; don't ask twice.
    let formOnScreen = false;
    const forms = document.querySelectorAll("[data-newsletter-form]");
    const watcher =
      forms.length > 0
        ? new IntersectionObserver(
            (entries) => {
              formOnScreen = entries.some((entry) => entry.isIntersecting);
              if (formOnScreen) setVisible(false);
            },
            { rootMargin: "80px" },
          )
        : null;
    forms.forEach((form) => watcher?.observe(form));

    const nearFoot = () =>
      document.documentElement.scrollHeight - window.scrollY - window.innerHeight < FOOTER_ZONE;

    const show = () => {
      if (dismissed.current || formOnScreen || nearFoot()) return;
      if (!shown.current) {
        shown.current = true;
        trackEvent("newsletter_slidein_shown", { path: pathname ?? "" });
      }
      setVisible(true);
    };

    /**
     * Runs on every scroll, not just the first one past the trigger: the card
     * has to step aside again when the visitor reaches the foot of the page,
     * where the ad unit sits, and come back if they scroll away from it.
     */
    const onScroll = () => {
      if (dismissed.current) return;
      if (formOnScreen || nearFoot()) {
        setVisible(false);
        return;
      }
      if (shown.current) {
        setVisible(true);
        return;
      }
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable > 0 && window.scrollY / scrollable >= SCROLL_TRIGGER) show();
    };

    const timer = window.setTimeout(show, DWELL_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      watcher?.disconnect();
    };
  }, [offLimits, pathname]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:justify-end sm:px-5 sm:pb-5"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div
        role="complementary"
        aria-label="Subscribe to the daily brief"
        className={`pointer-events-auto relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl transition duration-200 motion-reduce:transition-none sm:p-5 ${
          leaving ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="focus-ring absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <p className="pr-8 text-sm font-bold text-navy-900">Get the brief by email</p>
        <p className="mt-1 pr-8 text-xs leading-relaxed text-slate-600">
          The market brief and the week&apos;s book closures, once per trading day.
        </p>

        <NewsletterSignup
          source={`slidein${pathname ?? ""}`}
          compact
          dense
          className="mt-3"
          onDone={() => writeFlag(SIGNED_UP_KEY, "1")}
        />
      </div>
    </div>
  );
}
