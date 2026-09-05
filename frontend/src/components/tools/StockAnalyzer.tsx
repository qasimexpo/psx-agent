"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2, Search, ShieldCheck } from "lucide-react";
import SymbolInput from "@/components/tools/SymbolInput";
import { analyzeStock, type StockResult } from "@/lib/clientApi";
import { trackEvent } from "@/lib/analytics";
import { changeClass, money, percent } from "@/lib/format";
import { SectionHeading } from "@/components/ui/Primitives";

const VERDICT_STYLE: Record<string, string> = {
  "BUY MORE": "bg-emerald-100 text-emerald-800 border-emerald-200",
  HOLD: "bg-slate-100 text-slate-700 border-slate-200",
  TRIM: "bg-amber-100 text-amber-800 border-amber-200",
  EXIT: "bg-rose-100 text-rose-800 border-rose-200",
  WATCH: "bg-sky-100 text-sky-800 border-sky-200",
};

export default function StockAnalyzer() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockResult | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      setError("Enter a PSX symbol to analyse.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setResult(await analyzeStock(normalized));
      // Which symbols people analyse is the single most useful growth signal:
      // it says which /stock pages to deepen first.
      trackEvent("stock_analysis", { symbol: normalized });
    } catch (err) {
      trackEvent("stock_analysis_failed", { symbol: normalized });
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="analyzer" className="scroll-mt-20 bg-white px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="One symbol, one answer"
          title="Analyse any PSX stock"
          description="Live price, technical position, Shariah status and an AI read on what to watch. Levels are computed from five years of exchange data, never guessed."
        />

        <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <SymbolInput value={symbol} onChange={setSymbol} placeholder="Search a symbol, e.g. OGDC or Lucky Cement" />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Analyse
          </button>
        </form>

        {error ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="card mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-navy-900">{result.symbol}</h3>
                  {result.is_kmi ? (
                    <span className="badge badge-halal">
                      <ShieldCheck className="h-3 w-3" />
                      Shariah verified
                    </span>
                  ) : (
                    <span className="badge badge-neutral">Not KMI listed</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {result.name} · {result.sector_name}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular text-xl font-bold text-navy-900">
                  {money(result.current_price)}
                </p>
                <p className={`tabular text-sm font-semibold ${changeClass(result.change_pct)}`}>
                  {percent(result.change_pct)}
                </p>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <span
                  className={`badge border ${VERDICT_STYLE[result.verdict] ?? "bg-slate-100 text-slate-700"}`}
                >
                  {result.verdict}
                </span>
                <h4 className="mt-2 text-base font-semibold text-navy-900">{result.headline}</h4>
                <p className="mt-2 leading-relaxed text-slate-700">{result.outlook}</p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {result.positives.length ? (
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                        In its favour
                      </p>
                      <ul className="space-y-1">
                        {result.positives.map((item, index) => (
                          <li key={index} className="flex gap-2 text-sm text-slate-600">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {result.risks.length ? (
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-rose-700">
                        Risks
                      </p>
                      <ul className="space-y-1">
                        {result.risks.map((item, index) => (
                          <li key={index} className="flex gap-2 text-sm text-slate-600">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {result.shariah_note}
                </p>
              </div>

              <dl className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                {[
                  ["Buy zone", result.buy_zone],
                  ["Target", result.exit_target],
                  ["Support", result.support === null ? "—" : money(result.support)],
                  ["Resistance", result.resistance === null ? "—" : money(result.resistance)],
                  ["RSI (14)", result.rsi === null ? "—" : String(result.rsi)],
                  ["Trend", result.trend || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="tabular text-sm font-semibold text-navy-900">{value}</dd>
                  </div>
                ))}
                <p className="border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500">
                  Levels are swing highs and lows from five years of exchange closing prices.
                </p>
              </dl>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
