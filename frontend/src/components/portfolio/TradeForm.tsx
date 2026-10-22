"use client";

import { useActionState, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { tradeAction, type FormState } from "@/app/portfolio/actions";
import SymbolInput from "@/components/tools/SymbolInput";

const INPUT = "focus-ring tabular w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

/**
 * Records a buy or a sell. A buy merges into the position at the weighted
 * average cost; a sell reduces it and books the profit against that cost.
 * `today` comes from the server so the date field renders the same on both.
 */
export default function TradeForm({ today }: { today: string }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [symbol, setSymbol] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await tradeAction(prev, formData);
      if (result.ok) {
        setSymbol("");
        setFormKey((key) => key + 1);
      }
      return result;
    },
    {},
  );
  const buying = side === "buy";

  return (
    <form action={formAction} className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy-900">Record a trade</h2>
          <p className="mt-1 text-xs text-slate-500">
            Buying more of a stock combines it at your average cost. Selling books the profit or loss.
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Trade side">
          {(["buy", "sell"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={side === value}
              onClick={() => setSide(value)}
              className={`focus-ring rounded-md px-4 py-1.5 text-sm font-semibold capitalize transition ${
                side === value
                  ? value === "buy"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-navy-900"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <input type="hidden" name="side" value={side} />

      <div
        key={formKey}
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_130px_140px_150px_auto] lg:items-end"
      >
        <div className="sm:col-span-2 lg:col-span-1">
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
          <input id="add-quantity" name="quantity" type="number" inputMode="numeric" step="1" min="1" required placeholder="e.g. 500" className={INPUT} />
        </div>
        <div>
          <label htmlFor="add-price" className="mb-1 block text-xs font-semibold text-slate-600">
            {buying ? "Buy price (PKR)" : "Sell price (PKR)"}
          </label>
          <input id="add-price" name="price" type="number" inputMode="decimal" step="0.01" min="0.01" required placeholder="e.g. 245.50" className={INPUT} />
        </div>
        <div>
          <label htmlFor="add-date" className="mb-1 block text-xs font-semibold text-slate-600">
            Trade date
          </label>
          <input id="add-date" name="trade_date" type="date" max={today} defaultValue={today} required className={INPUT} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className={`focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
            buying ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
          }`}
        >
          {buying ? <Plus className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
          {pending ? "Saving…" : buying ? "Buy" : "Sell"}
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
