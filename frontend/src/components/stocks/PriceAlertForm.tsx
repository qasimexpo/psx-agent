"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { BellRing } from "lucide-react";

import { createAlertAction, type FormState } from "@/app/portfolio/actions";

/**
 * "Tell me when SYMBOL goes above / below Rs X". The page is static, so the
 * action sends a signed-out visitor to sign in first. The target starts 5%
 * away from the current price as a sensible default.
 */
export default function PriceAlertForm({ symbol, price }: { symbol: string; price: number | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createAlertAction, {});
  const suggested = price ? (Math.round(price * 1.05 * 100) / 100).toFixed(2) : "";
  // Controlled, because React resets a form's uncontrolled fields after every
  // action, including one that returns an error, which wiped what was typed.
  const [direction, setDirection] = useState("above");
  const [target, setTarget] = useState(suggested);

  return (
    <section className="card mt-4 p-5" aria-labelledby="alert-title">
      <h2 id="alert-title" className="flex items-center gap-1.5 text-base font-bold text-navy-900">
        <BellRing className="h-4 w-4 text-slate-500" aria-hidden />
        Price alert
      </h2>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="symbol" value={symbol} />
        <span className="text-slate-700">Tell me when {symbol} goes</span>
        <select
          name="direction"
          aria-label="Direction"
          className="focus-ring rounded-lg border border-slate-300 bg-white px-2 py-1.5"
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
        >
          <option value="above">above</option>
          <option value="below">below</option>
        </select>
        <label className="flex items-center gap-1 text-slate-700">
          Rs
          <input
            name="target"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            aria-label="Target price"
            className="focus-ring tabular w-28 rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="focus-ring rounded-lg bg-navy-900 px-3 py-1.5 font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60"
        >
          {pending ? "Setting…" : "Set alert"}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-rose-600">{state.error}</p>
      ) : state.ok ? (
        <p role="status" className="mt-2 text-sm text-emerald-700">
          {state.ok}{" "}
          <Link href="/portfolio" className="font-semibold underline-offset-2 hover:underline">
            See your alerts
          </Link>
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Checked each time prices update, about every 30 minutes in trading hours. An alert fires once.
        </p>
      )}
    </section>
  );
}
