"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { analyzeSingleStock, type SingleStockAnalyzeResult } from "@/lib/api";

const actionBadgeClasses: Record<string, string> = {
  "STRONG BUY": "bg-emerald-100 text-emerald-800 border-emerald-200",
  BUY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  HOLD: "bg-amber-100 text-amber-800 border-amber-200",
  SELL: "bg-red-100 text-red-800 border-red-200",
};

export default function QuickStockAnalyzer() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SingleStockAnalyzeResult | null>(null);

  const normalizedAction = useMemo(
    () => (result?.action ?? "").trim().toUpperCase(),
    [result?.action],
  );

  const badgeClass =
    actionBadgeClasses[normalizedAction] ??
    "bg-slate-100 text-slate-700 border-slate-200";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      setError("Please enter a PSX symbol to analyze.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await analyzeSingleStock(normalizedSymbol);
      setResult(response);
      setSymbol(normalizedSymbol);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to analyze stock.";
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#0B132B] sm:text-3xl">Quick Stock Analyzer</h2>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Enter any PSX symbol for an instant AI deep dive.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g., OGDC, LUCK, HUBC"
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm text-[#0B132B] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 sm:text-base"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70 sm:min-w-[170px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Analyze Stock"
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="glass-card mt-6 rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-xl font-bold text-[#0B132B] sm:text-2xl">{result.symbol}</h3>
              <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold sm:text-sm ${badgeClass}`}>
                {normalizedAction || result.action}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Live Price
                </p>
                <p className="mt-2 text-2xl font-bold text-[#0B132B] sm:text-3xl">
                  {result.current_price}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Target Price
                </p>
                <p className="mt-2 text-xl font-bold text-[#0B132B] sm:text-2xl">
                  {result.target_price}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Suggested Portfolio Weight (w8)
                </p>
                <p className="mt-2 text-base font-semibold text-[#0B132B] sm:text-lg">
                  {result.weightage_recommendation}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-white/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                AI Future Analysis
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 sm:text-base">
                {result.future_outlook}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
