"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
import SymbolAutocomplete from "@/components/SymbolAutocomplete";
import TimeframeSelector from "@/components/TimeframeSelector";
import WhatsAppCta from "@/components/WhatsAppCta";
import { analyzePortfolio, type AnalyzeResult, type Share } from "@/lib/api";
import type { AnalysisTimeframe } from "@/lib/timeframes";

type ShareRow = {
  symbol: string;
  buy_price: string;
  quantity: string;
};

const emptyRow = (): ShareRow => ({
  symbol: "",
  buy_price: "",
  quantity: "",
});

type PortfolioFormProps = {
  onReport: (result: AnalyzeResult | null) => void;
  onLoadingChange: (loading: boolean, symbols?: string[]) => void;
  onError: (message: string) => void;
};

export default function PortfolioForm({
  onReport,
  onLoadingChange,
  onError,
}: PortfolioFormProps) {
  const [rows, setRows] = useState<ShareRow[]>([emptyRow()]);
  const [timeframe, setTimeframe] = useState<AnalysisTimeframe>("1d");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usedSymbols = useMemo(
    () => rows.map((row) => row.symbol.trim().toUpperCase()).filter(Boolean),
    [rows],
  );

  const updateRow = (index: number, field: keyof ShareRow, value: string) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const addRow = () => {
    if (rows.length < 5) {
      setRows((current) => [...current, emptyRow()]);
    }
  };

  const removeRow = (index: number) => {
    if (rows.length > 1) {
      setRows((current) => current.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const shares: Share[] = [];
    for (const row of rows) {
      const symbol = row.symbol.trim().toUpperCase();
      const buy_price = parseFloat(row.buy_price);
      const quantity = parseInt(row.quantity, 10);

      if (!symbol || Number.isNaN(buy_price) || Number.isNaN(quantity)) {
        setError("Please fill in all fields with valid values for each stock.");
        return;
      }
      if (buy_price <= 0 || quantity <= 0) {
        setError("Buy price and quantity must be greater than zero.");
        return;
      }
      shares.push({ symbol, buy_price, quantity });
    }

    setSubmitting(true);
    onLoadingChange(true, shares.map((share) => share.symbol));

    try {
      const result = await analyzePortfolio(shares, timeframe);
      onReport(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed.";
      setError(message);
      onError(message);
      onReport(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="analyze" className="scroll-mt-20 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-navy-950">Portfolio Input</h2>
              <p className="mt-2 text-slate-600">
                Add up to 5 PSX holdings. Live prices are fetched automatically by our AI.
              </p>
            </div>
            <TimeframeSelector
              value={timeframe}
              onChange={setTimeframe}
              disabled={submitting}
              className="w-full sm:w-auto"
            />
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {rows.map((row, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
              >
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Symbol
                  </label>
                  <SymbolAutocomplete
                    value={row.symbol}
                    onChange={(value) => updateRow(index, "symbol", value)}
                    placeholder="OGDC"
                    disabled={submitting}
                    excludeSymbols={usedSymbols.filter(
                      (symbol) => symbol !== row.symbol.trim().toUpperCase(),
                    )}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Buy Price (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.buy_price}
                    onChange={(e) => updateRow(index, "buy_price", e.target.value)}
                    placeholder="300"
                    autoComplete="off"
                    suppressHydrationWarning
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-navy-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, "quantity", e.target.value)}
                    placeholder="1000"
                    autoComplete="off"
                    suppressHydrationWarning
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-navy-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  disabled={rows.length === 1}
                  suppressHydrationWarning
                  className="flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Remove stock"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= 5}
                suppressHydrationWarning
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-navy-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Another Stock ({rows.length}/5)
              </button>

              <button
                type="submit"
                disabled={submitting}
                suppressHydrationWarning
                className="glow-button inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70 sm:min-w-[240px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate AI Report"
                )}
              </button>
            </div>
            <WhatsAppCta />
          </form>
        </div>
      </div>
    </section>
  );
}
