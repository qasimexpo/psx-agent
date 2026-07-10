"use client";

import { useState } from "react";
import Image from "next/image";
import { Bot, ChevronDown, ChevronUp, Download, Loader2 } from "lucide-react";
import WhatsAppCta from "@/components/WhatsAppCta";
import type { AnalyzeResult } from "@/lib/api";
import { exportReportToPdf } from "@/lib/exportPdf";
import { IMAGES } from "@/lib/images";

type ReportViewProps = {
  visible?: boolean;
  data: AnalyzeResult | null;
  loading?: boolean;
};

function formatPrice(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPl(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}Rs. ${Math.abs(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

export default function ReportView({
  visible = true,
  data,
  loading = false,
}: ReportViewProps) {
  const [exporting, setExporting] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);

  if (!visible) {
    return null;
  }

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportReportToPdf(data);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="report" className="px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold text-[#0B132B]">Your AI Portfolio Report</h2>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !data || loading}
            className="glow-button inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Generating PDF..." : "📥 Download Report as PDF"}
          </button>
        </div>

        <div
          id="report-container"
          className="report-container min-h-[200px] rounded-2xl border border-slate-200 p-6 shadow-lg sm:p-8"
        >
          {loading && (
            <div className="py-10">
              <div className="mb-6 flex items-center justify-center gap-3 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                <p className="text-base font-semibold text-[#0B132B]">
                  AI is crunching the numbers. Please wait...
                </p>
              </div>
              <div className="space-y-4">
                <div className="h-6 w-1/3 animate-pulse rounded-md bg-slate-200" />
                <div className="h-12 w-full animate-pulse rounded-md bg-slate-200" />
                <div className="h-12 w-full animate-pulse rounded-md bg-slate-200" />
                <div className="h-24 w-full animate-pulse rounded-xl bg-slate-100" />
              </div>
            </div>
          )}

          {!loading && !data && (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="rounded-2xl bg-red-50 p-4">
                <Bot className="h-8 w-8 text-red-500" />
              </div>
              <p className="text-lg font-semibold text-[#0B132B]">
                Portfolio analysis could not be completed.
              </p>
              <p className="max-w-lg text-sm text-slate-500">
                Please review the error above and try generating the report again.
              </p>
            </div>
          )}

          {!loading && data && (
            <>
              <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <Image
                    src={IMAGES.logo}
                    alt="SmartSarmaya"
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                  <div>
                    <p className="text-lg font-bold text-[#0B132B]">SmartSarmaya</p>
                    <p className="text-sm text-slate-500">AI PSX Portfolio Auditor</p>
                  </div>
                </div>
                <p className="text-right text-sm text-slate-500">{data.report_date}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-[#0B132B]">
                      <th className="px-3 py-2.5">Symbol</th>
                      <th className="px-3 py-2.5">Qty</th>
                      <th className="px-3 py-2.5">Buy Price</th>
                      <th className="px-3 py-2.5">Live Price</th>
                      <th className="px-3 py-2.5">P/L (PKR)</th>
                      <th className="px-3 py-2.5">RSI</th>
                      <th className="px-3 py-2.5">AI Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.holdings.map((row) => (
                      <tr key={row.symbol} className="border-b border-slate-100">
                        <td className="px-3 py-2.5 font-semibold text-[#0B132B]">
                          {row.symbol}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">{row.quantity.toLocaleString()}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatPrice(row.buy_price)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatPrice(row.live_price)}</td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 font-medium ${
                            row.pl_pkr !== null && row.pl_pkr >= 0
                              ? "text-emerald-600"
                              : row.pl_pkr !== null
                                ? "text-red-600"
                                : ""
                          }`}
                        >
                          {formatPl(row.pl_pkr)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {row.rsi !== null ? row.rsi.toFixed(2) : "N/A"}
                        </td>
                        <td className="px-3 py-2.5">{row.ai_action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-bold text-[#0B132B]">AI Risk Analysis Summary</h3>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                  {data.risk_summary}
                </pre>
              </div>

              <div className="mt-6">
                <WhatsAppCta />
              </div>

              <p className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
                SmartSarmaya.com | AI PSX Portfolio Auditor
              </p>
            </>
          )}
        </div>

        {data && !loading && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowFullReport((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              {showFullReport ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showFullReport ? "Hide Full AI Report" : "View Full AI Report"}
            </button>

            {showFullReport && (
              <div className="report-content mt-4 rounded-2xl border border-slate-200 bg-white p-6">
                <div className="report-html-wrap overflow-x-auto">
                  <div dangerouslySetInnerHTML={{ __html: data.report_html }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
