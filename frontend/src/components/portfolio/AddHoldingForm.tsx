"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { addHoldingAction, type FormState } from "@/app/portfolio/actions";
import SymbolInput from "@/components/tools/SymbolInput";

const INPUT = "focus-ring tabular w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

/** Adds shares; buying more of a held symbol merges at the weighted average cost. */
export default function AddHoldingForm() {
  const [symbol, setSymbol] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await addHoldingAction(prev, formData);
      if (result.ok) {
        // Clear the fields for the next entry; the message stays.
        setSymbol("");
        setFormKey((key) => key + 1);
      }
      return result;
    },
    {},
  );

  return (
    <form action={formAction} className="card p-4 sm:p-5">
      <h2 className="text-base font-bold text-navy-900">Add shares</h2>
      <p className="mt-1 text-xs text-slate-500">
        Adding a stock you already hold combines the two at your average cost.
      </p>

      <div
        key={formKey}
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_150px_auto] sm:items-end"
      >
        <div>
          <label htmlFor="add-symbol" className="mb-1 block text-xs font-semibold text-slate-600">
            Symbol
          </label>
          <SymbolInput id="add-symbol" value={symbol} onChange={setSymbol} />
          <input type="hidden" name="symbol" value={symbol} />
        </div>
        <div>
          <label htmlFor="add-quantity" className="mb-1 block text-xs font-semibold text-slate-600">
            Shares
          </label>
          <input
            id="add-quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            required
            placeholder="e.g. 500"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="add-price" className="mb-1 block text-xs font-semibold text-slate-600">
            Buy price (PKR)
          </label>
          <input
            id="add-price"
            name="price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            placeholder="e.g. 245.50"
            className={INPUT}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {pending ? "Adding…" : "Add"}
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {state.error}
        </p>
      ) : state.ok ? (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
