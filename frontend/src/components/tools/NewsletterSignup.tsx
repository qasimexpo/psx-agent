"use client";

import { useId, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";

import { subscribeToNewsletter } from "@/lib/clientApi";
import { trackEvent } from "@/lib/analytics";

/**
 * Newsletter signup.
 *
 * `source` records which page the address came from, which is the only way to
 * tell later whether the brief pages or the guides are what makes people
 * subscribe. The honeypot field is hidden from sight and from assistive
 * technology, and left out of the tab order, so only a bot fills it in.
 */
export default function NewsletterSignup({
  source,
  className = "",
  compact = false,
}: {
  source: string;
  className?: string;
  compact?: boolean;
}) {
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    setState("sending");
    setError(null);
    try {
      await subscribeToNewsletter(email.trim(), honeypot ? "bot" : source);
      setState("done");
      trackEvent("newsletter_signup", { source });
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Could not save your address.");
    }
  };

  if (state === "done") {
    return (
      <div
        className={`flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 ${className}`}
        role="status"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold text-navy-900">You are on the list.</p>
          <p className="mt-1 text-slate-600">
            The first issue goes out once the newsletter launches. Every email has an
            unsubscribe link, and your address is never shared or sold.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className} noValidate>
      {!compact ? (
        <label htmlFor={fieldId} className="mb-2 block text-sm font-semibold text-navy-900">
          Get the daily brief by email
        </label>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            id={fieldId}
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="send"
            required
            placeholder="you@example.com"
            aria-label={compact ? "Email address for the daily brief" : undefined}
            aria-invalid={error ? true : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="focus-ring w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-navy-900 placeholder:text-slate-400"
          />
        </div>

        {/* Honeypot: hidden from people, irresistible to bots. */}
        <input
          type="text"
          name="company"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        <button
          type="submit"
          disabled={state === "sending"}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Subscribing
            </>
          ) : (
            "Subscribe"
          )}
        </button>
      </div>

      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-600" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          One email per trading day: the market brief and what is scheduled. No tips, no
          spam, unsubscribe in one click.
        </p>
      )}
    </form>
  );
}
