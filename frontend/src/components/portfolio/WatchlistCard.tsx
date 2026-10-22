"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, X } from "lucide-react";

import { addWatchAction, removeWatchAction, type FormState } from "@/app/portfolio/actions";
import { Delta, MiniTrend } from "@/components/charts/Trend";
import SymbolInput from "@/components/tools/SymbolInput";
import { HalalBadge, RangeBar } from "@/components/ui/Primitives";
import type { PricePoint } from "@/lib/charts";
import { money, percent, rangePosition } from "@/lib/format";
import type { Watched } from "@/lib/portfolio";

export type WatchRow = Watched & { trend: PricePoint[]; trendChange: number | null };

/** Stocks followed without holding them, each linking to its page. */
export default function WatchlistCard({ rows }: { rows: WatchRow[] }) {
  const [symbol, setSymbol] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await addWatchAction(prev, formData);
      if (result.ok) {
        setSymbol("");
        setFormKey((key) => key + 1);
      }
      return result;
    },
    {},
  );

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy-900">Watchlist</h2>
          <p className="mt-0.5 text-xs text-slate-500">Stocks you follow without holding them.</p>
        </div>
        <form key={formKey} action={formAction} className="flex w-full items-start gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-56">
            <SymbolInput id="watch-symbol" value={symbol} onChange={setSymbol} placeholder="Add a symbol" />
            <input type="hidden" name="symbol" value={symbol} />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <Eye className="h-4 w-4" aria-hidden />
            Watch
          </button>
        </form>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-rose-600">{state.error}</p>
      ) : state.ok ? (
        <p role="status" className="mt-2 text-sm text-emerald-700">{state.ok}</p>
      ) : null}

      {rows.length ? (
        <div className="table-scroll mt-3">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3">3 months</th>
                <th className="py-2 pr-3 text-right">Price · today</th>
                <th className="w-40 py-2 pr-3">52-week range</th>
                <th className="py-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const position = rangePosition(row.price, row.low_52w, row.high_52w);
                return (
                  <tr key={row.symbol} className="border-t border-slate-100 align-middle">
                    <td className="py-2.5 pr-3">
                      <Link href={`/stock/${row.symbol}`} className="group block rounded focus-ring">
                        <span className="font-semibold text-navy-900 group-hover:text-emerald-700 group-hover:underline">
                          {row.symbol}
                        </span>
                        <span className="block max-w-[14rem] truncate text-xs text-slate-500">{row.name || "—"}</span>
                      </Link>
                      <div className="mt-1"><HalalBadge verified={row.is_kmi} /></div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Link href={`/stock/${row.symbol}`} className="flex items-center gap-2 rounded focus-ring" aria-label={`${row.symbol} chart`}>
                        <MiniTrend points={row.trend} change={row.trendChange} caption={`${row.symbol} over 3 months: ${percent(row.trendChange)}`} />
                        <Delta value={row.trendChange} className="text-xs" />
                      </Link>
                    </td>
                    <td className="tabular py-2.5 pr-3 text-right">
                      <span className="font-semibold text-navy-900">{money(row.price)}</span>
                      <span className="block text-xs"><Delta value={row.change_pct} /></span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {position === null ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <RangeBar position={position} low={money(row.low_52w)} high={money(row.high_52w)} />
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <form action={removeWatchAction}>
                        <input type="hidden" name="symbol" value={row.symbol} />
                        <button
                          type="submit"
                          aria-label={`Stop watching ${row.symbol}`}
                          className="focus-ring rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Nothing on your watchlist yet. Add a symbol above, or press Watch on any stock page.
        </p>
      )}
    </section>
  );
}
