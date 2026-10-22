"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/auth/client";

type Status = "idle" | "sending" | "sent";

/**
 * Passwordless sign-in: an emailed link, or Google. Both land on
 * /auth/callback, which creates the profile on first sign-in, so signing up
 * and signing in are the same step.
 */
export default function LoginForm({ next, error }: { next: string; error: string | null }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(error);

  function callbackUrl(): string {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);
    const { error: sendError } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    if (sendError) {
      setStatus("idle");
      setMessage(
        sendError.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "We could not send the link. Check the address and try again.",
      );
      return;
    }
    setStatus("sent");
  }

  async function signInWithGoogle() {
    setMessage(null);
    const { error: oauthError } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) setMessage("Google sign-in is unavailable right now. Use the email link.");
  }

  if (status === "sent") {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <MailCheck className="h-10 w-10 text-emerald-600" aria-hidden />
        <h1 className="text-lg font-bold text-navy-900">Check your email</h1>
        <p className="text-sm text-slate-600">
          We sent a sign-in link to <span className="font-semibold">{email.trim()}</span>. Open it
          on this device to continue. It expires in an hour.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="focus-ring mt-2 rounded text-sm font-semibold text-emerald-700 hover:underline"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <p className="eyebrow mb-1.5">Free account</p>
      <h1 className="section-title">Sign in or create an account</h1>
      <p className="mt-2 text-sm text-slate-600">
        Track your PSX holdings with live prices, profit and loss, and a Shariah check. No
        password: we email you a link.
      </p>

      {message ? (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={signInWithGoogle}
        className="focus-ring mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:bg-slate-50"
      >
        <GoogleMark />
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={sendLink} className="space-y-3">
        <label htmlFor="email" className="block text-sm font-semibold text-navy-900">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="focus-ring w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {status === "sending" ? "Sending link…" : "Email me a sign-in link"}
        </button>
      </form>

      <p className="mt-5 text-xs leading-relaxed text-slate-500">
        By continuing you agree to the{" "}
        <Link href="/terms-of-service" className="font-semibold text-emerald-700 hover:underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy-policy" className="font-semibold text-emerald-700 hover:underline">
          privacy policy
        </Link>
        . Your holdings are private to your account and are never sold or shared.
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
