"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Sparkles, X } from "lucide-react";

import { Delta } from "@/components/charts/Trend";
import { HalalBadge } from "@/components/ui/Primitives";
import { analyzeStock, type StockResult } from "@/lib/clientApi";
import { changeClass, money, pkr, signedMoney } from "@/lib/format";
import type { Position } from "@/lib/portfolio";
import { VERDICT_MEANING, VERDICT_STYLE } from "@/lib/verdicts";

// One analysis per symbol per visit: reopening a stock is instant and does not
// spend the shared AI quota again.
const cache = new Map<string, StockResult>();

type State = { status: "loading" } | { status: "ready"; result: StockResult } | { status: "error"; message: string };

/**
 * A side panel for one holding: the position in the user's own numbers, then
 * the same AI analysis the home page's stock analyser gives, with a link to
 * the stock's full page. Escape, the close button or the backdrop close it,
 * and focus returns to the button that opened it.
 */
export default function HoldingInsight({ position, onClose }: { position: Position; onClose: () => void }) {
  const [state, setState] = useState<State>(() => {
    const cached = cache.get(position.symbol);
    return cached ? { status: "ready", result: cached } : { status: "loading" };
  });
  const closeRef = useRef<HTMLButtonElement>(null);
  // The latest onClose, so the open/close effect below runs once per opening
  // rather than again whenever the page's auto-refresh re-renders the row.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Starts the request; the state is already "loading" when it runs.
  const fetchAnalysis = useCallback(() => {
    analyzeStock(position.symbol)
      .then((result) => {
        cache.set(position.symbol, result);
        setState({ status: "ready", result });
      })
      .catch((error: unknown) =>
        setState({ status: "error", message: error instanceof Error ? error.message : "The analysis could not be loaded." }),
      );
  }, [position.symbol]);

  function retry() {
    setState({ status: "loading" });
    fetchAnalysis();
  }

  useEffect(() => {
    if (!cache.has(position.symbol)) fetchAnalysis();
  }, [position.symbol, fetchAnalysis]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  const result = state.status === "ready" ? state.result : null;
  const vsCost = position.price !== null && position.avg_price > 0 ? ((position.price - position.avg_price) / position.avg_price) * 100 : null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-navy-950/40" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="insight-title"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 id="insight-title" className="text-lg font-bold text-navy-900">
              {position.symbol}
            </h2>
            <p className="truncate text-sm text-slate-500">{position.name}</p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span className="tabular font-semibold text-navy-900">{pkr(position.price)}</span>
              <Delta value={position.change_pct} suffix="today" />
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-5 py-5">
          <section aria-labelledby="position-title">
            <h3 id="position-title" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Your position
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {[
                ["Shares", position.quantity.toLocaleString("en-PK")],
                ["Average cost", pkr(position.avg_price)],
                ["Value", pkr(position.value)],
              ].map(([term, value]) => (
                <div key={term} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-xs text-slate-500">{term}</dt>
                  <dd className="tabular font-semibold text-navy-900">{value}</dd>
                </div>
              ))}
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Profit / loss</dt>
                <dd className={`tabular font-semibold ${changeClass(position.pl)}`}>
                  {signedMoney(position.pl)} <Delta value={vsCost} className="text-xs" />
                </dd>
              </div>
            </dl>
            <div className="mt-2"><HalalBadge verified={position.is_kmi} /></div>
          </section>

          <section aria-labelledby="ai-title" aria-busy={state.status === "loading"}>
            <h3 id="ai-title" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI recommendation
            </h3>

            {state.status === "loading" ? (
              <div className="mt-3 space-y-2" aria-label="Analysing">
                <div className="h-7 w-28 animate-pulse rounded-full bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                <p className="pt-1 text-xs text-slate-500">Reading prices, technicals and news for {position.symbol}…</p>
              </div>
            ) : state.status === "error" ? (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700">
                <p>{state.message}</p>
                <button type="button" onClick={retry} className="focus-ring mt-2 rounded font-semibold underline-offset-2 hover:underline">
                  Try again
                </button>
              </div>
            ) : result ? (
              <div className="mt-3 space-y-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge border text-sm ${VERDICT_STYLE[result.verdict] ?? "bg-slate-100 text-slate-700"}`}>
                    {result.verdict}
                  </span>
                  <span className="text-xs text-slate-500">{VERDICT_MEANING[result.verdict] ?? ""}</span>
                </div>
                {result.headline ? <p className="font-semibold leading-snug text-navy-900">{result.headline}</p> : null}
                {result.outlook ? <p className="leading-relaxed text-slate-700">{result.outlook}</p> : null}

                {result.positives.length || result.risks.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-emerald-700">In its favour</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                        {result.positives.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-rose-600">Risks</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                        {result.risks.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                ) : null}

                <dl className="grid grid-cols-2 gap-2">
                  {[
                    ["Buy zone", result.buy_zone],
                    ["Target", result.exit_target],
                    ["Support", result.support !== null ? money(result.support) : "—"],
                    ["Resistance", result.resistance !== null ? money(result.resistance) : "—"],
                    ["RSI (14)", result.rsi !== null ? result.rsi.toFixed(0) : "—"],
                    ["Trend", result.trend || "—"],
                  ].map(([term, value]) => (
                    <div key={term} className="rounded-lg border border-slate-100 px-3 py-2">
                      <dt className="text-xs text-slate-500">{term}</dt>
                      <dd className="tabular font-semibold text-navy-900">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>

                {result.shariah_note ? <p className="text-xs leading-relaxed text-slate-600">{result.shariah_note}</p> : null}
                {!result.ai_available ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    The AI model was unavailable, so this verdict comes from the rules on RSI and trend alone.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <Link
            href={`/stock/${position.symbol}`}
            className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-slate-50"
          >
            Full {position.symbol} page: chart, technicals, alerts
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>

          <p className="text-xs leading-relaxed text-slate-500">
            An AI reading of public prices, technicals and news, for research. It does not know your
            goals or other holdings and is not financial advice.
          </p>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
