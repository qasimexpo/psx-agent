"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Download, Loader2, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import SymbolInput from "@/components/tools/SymbolInput";
import { analyzePortfolio, type PortfolioResult, type ShareInput } from "@/lib/clientApi";
import { trackEvent } from "@/lib/analytics";
import { changeClass, money, percent, pkr, signedMoney } from "@/lib/format";
import { SectionHeading, SymbolLink } from "@/components/ui/Primitives";

const MAX_ROWS = 8;

type Row = { symbol: string; buyPrice: string; quantity: string };

const emptyRow = (): Row => ({ symbol: "", buyPrice: "", quantity: "" });

const HORIZONS = [
  { key: "short", label: "Short term" },
  { key: "medium", label: "Medium term" },
  { key: "long", label: "Long term" },
];

const ACTION_STYLE: Record<string, string> = {
  "BUY MORE": "bg-emerald-100 text-emerald-800",
  HOLD: "bg-slate-100 text-slate-700",
  TRIM: "bg-amber-100 text-amber-800",
  EXIT: "bg-rose-100 text-rose-800",
};

export default function PortfolioAudit() {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [horizon, setHorizon] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PortfolioResult | null>(null);

  const usedSymbols = useMemo(
    () => rows.map((row) => row.symbol.trim().toUpperCase()).filter(Boolean),
    [rows],
  );

  const update = (index: number, field: keyof Row, value: string) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const shares: ShareInput[] = [];
    for (const row of rows) {
      const symbol = row.symbol.trim().toUpperCase();
      const buy_price = Number.parseFloat(row.buyPrice);
      const quantity = Number.parseInt(row.quantity, 10);
      if (!symbol) continue;
      if (!Number.isFinite(buy_price) || buy_price <= 0) {
        setError(`Enter the price you paid for ${symbol}.`);
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError(`Enter how many shares of ${symbol} you hold.`);
        return;
      }
      shares.push({ symbol, buy_price, quantity });
    }

    if (!shares.length) {
      setError("Add at least one holding to audit.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      setResult(await analyzePortfolio(shares, horizon));
      trackEvent("portfolio_audit", { holdings: shares.length, horizon });
      requestAnimationFrame(() => {
        document.getElementById("audit-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      trackEvent("portfolio_audit_failed", { holdings: shares.length });
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="audit" className="scroll-mt-20 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Free, no account, nothing stored"
          title="Audit your portfolio"
          description="Enter what you hold. You get live prices, profit and loss, sector concentration, Shariah compliance and a per-holding call. Your holdings are used for this request only and never saved."
        />

        <form onSubmit={handleSubmit} className="card p-5 sm:p-6">
          <div className="space-y-3">
            <div className="hidden gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[1fr_140px_140px_40px]">
              <span>Symbol</span>
              <span>Buy price (PKR)</span>
              <span>Quantity</span>
              <span />
            </div>

            {rows.map((row, index) => (
              <div
                key={index}
                className="grid gap-3 sm:grid-cols-[1fr_140px_140px_40px] sm:items-center"
              >
                <SymbolInput
                  id={`symbol-${index}`}
                  value={row.symbol}
                  onChange={(symbol) => update(index, "symbol", symbol)}
                  exclude={usedSymbols.filter((s) => s !== row.symbol.trim().toUpperCase())}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  placeholder="Buy price"
                  value={row.buyPrice}
                  onChange={(event) => update(index, "buyPrice", event.target.value)}
                  className="focus-ring tabular w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  placeholder="Quantity"
                  value={row.quantity}
                  onChange={(event) => update(index, "quantity", event.target.value)}
                  className="focus-ring tabular w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  disabled={rows.length === 1}
                  aria-label={`Remove holding ${index + 1}`}
                  className="focus-ring justify-self-start rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 sm:justify-self-center"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setRows((current) => [...current, emptyRow()])}
              disabled={rows.length >= MAX_ROWS}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Add holding ({rows.length}/{MAX_ROWS})
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {HORIZONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setHorizon(item.key)}
                    className={`focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      horizon === item.key
                        ? "bg-white text-navy-900 shadow-sm"
                        : "text-slate-600 hover:text-navy-900"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analysing
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Run free audit
                  </>
                )}
              </button>
            </div>
          </div>

          {error ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </form>

        {result ? <AuditResult result={result} /> : null}
      </div>
    </section>
  );
}

function AuditResult({ result }: { result: PortfolioResult }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Loaded on demand so the PDF library stays out of the initial bundle.
      const { exportAuditToPdf } = await import("@/lib/exportPdf");
      await exportAuditToPdf(result);
    } catch {
      // Nothing to recover from; the on-screen report is still available.
    } finally {
      setExporting(false);
    }
  };

  return (
    <div id="audit-result" className="mt-6 scroll-mt-20 space-y-4">
      <div className="no-print flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy-900 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download PDF
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Market value
          </p>
          <p className="tabular mt-1 text-xl font-bold text-navy-900">
            {pkr(result.totals.market_value)}
          </p>
          <p className="text-xs text-slate-500">Cost {pkr(result.totals.invested)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Unrealised P/L
          </p>
          <p className={`tabular mt-1 text-xl font-bold ${changeClass(result.totals.pl_pkr)}`}>
            {signedMoney(result.totals.pl_pkr)}
          </p>
          <p className={`text-xs font-semibold ${changeClass(result.totals.pl_pct)}`}>
            {percent(result.totals.pl_pct)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Shariah compliant
          </p>
          <p className="tabular mt-1 text-xl font-bold text-emerald-600">
            {result.totals.halal_pct}%
          </p>
          <p className="text-xs text-slate-500">of portfolio value</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Largest sector
          </p>
          <p className="mt-1 truncate text-base font-bold text-navy-900" title={result.totals.top_sector}>
            {result.totals.top_sector}
          </p>
          <p
            className={`text-xs font-semibold ${
              result.totals.top_sector_pct > 40 ? "text-amber-600" : "text-slate-500"
            }`}
          >
            {result.totals.top_sector_pct}% of value
            {result.totals.top_sector_pct > 40 ? " · concentrated" : ""}
          </p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-navy-900">Your audit</h3>
          <span className="badge badge-neutral">{result.report_date}</span>
          {!result.ai_available ? (
            <span className="badge bg-amber-100 text-amber-800">
              AI commentary unavailable, showing rules-based calls
            </span>
          ) : null}
        </div>

        <p className="mt-3 leading-relaxed text-slate-700">{result.verdict}</p>
        <p className="mt-2 leading-relaxed text-slate-600">{result.risk_summary}</p>
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-emerald-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          {result.shariah_note}
        </p>

        {result.next_steps.length ? (
          <ul className="mt-4 space-y-1.5">
            {result.next_steps.map((step, index) => (
              <li key={index} className="flex gap-2 text-sm text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {step}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Holding</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5 text-right">Cost</th>
                <th className="px-4 py-2.5 text-right">Live</th>
                <th className="px-4 py-2.5 text-right">P/L</th>
                <th className="px-4 py-2.5 text-right">Weight</th>
                <th className="px-4 py-2.5">Call</th>
              </tr>
            </thead>
            <tbody>
              {result.holdings.map((holding) => (
                <tr key={holding.symbol} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <SymbolLink symbol={holding.symbol} />
                      {holding.is_kmi ? (
                        <span className="badge badge-halal">Halal</span>
                      ) : (
                        <span className="badge badge-neutral">Not KMI</span>
                      )}
                    </div>
                    <p className="mt-0.5 max-w-[16rem] truncate text-xs text-slate-500">
                      {holding.sector_name}
                    </p>
                    {holding.events.length ? (
                      <p className="mt-1 text-xs text-amber-700">{holding.events[0]}</p>
                    ) : null}
                  </td>
                  <td className="tabular px-4 py-3 text-right text-slate-700">{holding.quantity}</td>
                  <td className="tabular px-4 py-3 text-right text-slate-700">
                    {money(holding.buy_price)}
                  </td>
                  <td className="tabular px-4 py-3 text-right font-semibold text-navy-900">
                    {money(holding.live_price)}
                  </td>
                  <td className={`tabular px-4 py-3 text-right font-semibold ${changeClass(holding.pl_pkr)}`}>
                    {signedMoney(holding.pl_pkr)}
                    <span className="block text-xs font-normal">{percent(holding.pl_pct)}</span>
                  </td>
                  <td className="tabular px-4 py-3 text-right text-slate-700">
                    {holding.weight_pct}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${ACTION_STYLE[holding.action] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {holding.action}
                    </span>
                    <p className="mt-1 max-w-[22rem] text-xs leading-relaxed text-slate-600">
                      {holding.reason}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Educational analysis only, not financial advice and not a religious ruling. Prices come from
        the PSX data portal and may be delayed. Your holdings were not saved.
      </p>
    </div>
  );
}
