"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Eye } from "lucide-react";

import { watchFromStockPage, type FormState } from "@/app/portfolio/actions";

/**
 * Adds the stock to the visitor's watchlist. The stock page is static, so it
 * cannot know whether the visitor is signed in or already watching: the
 * action sends a signed-out visitor to sign in, and following twice is fine.
 */
export default function WatchButton({ symbol }: { symbol: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(watchFromStockPage, {});

  if (state.ok) {
    return (
      <p className="text-sm text-emerald-700" role="status">
        On your watchlist ·{" "}
        <Link href="/portfolio" className="font-semibold underline-offset-2 hover:underline">
          View
        </Link>
      </p>
    );
  }

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="symbol" value={symbol} />
      <button
        type="submit"
        disabled={pending}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        <Eye className="h-4 w-4" aria-hidden />
        {pending ? "Adding…" : "Watch"}
      </button>
      {state.error ? <span className="text-xs text-rose-600">{state.error}</span> : null}
    </form>
  );
}
