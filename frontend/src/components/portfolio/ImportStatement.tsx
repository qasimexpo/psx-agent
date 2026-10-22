"use client";

import { useState, type ChangeEvent } from "react";
import { FileUp } from "lucide-react";

import { extractHoldingsAction, importHoldingsAction, type Candidate } from "@/app/portfolio/importActions";
import { money } from "@/lib/format";
import { scrubStatement } from "@/lib/statement";

type Row = Candidate & { include: boolean; qty: string; cost: string };
type Stage = "idle" | "reading" | "review" | "saving";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Import holdings from a broker or CDC statement PDF.
 *
 * The file is read here, in the browser, and never uploaded. Only its text,
 * with account numbers, CNICs, phone numbers and emails removed, goes to the
 * server, which asks the AI model to list the holdings. Every row is shown
 * for review and editing; nothing is saved until the visitor confirms.
 */
export default function ImportStatement() {
  const [stage, setStage] = useState<Stage>("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage({ tone: "error", text: "Choose a PDF statement." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({ tone: "error", text: "That file is over 10 MB. Export a shorter statement." });
      return;
    }

    setStage("reading");
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      const result = await extractHoldingsAction(scrubStatement(text));
      if (result.error) {
        setStage("idle");
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setRows(
        (result.candidates ?? []).map((c) => ({
          ...c,
          include: true,
          qty: String(c.quantity),
          cost: (c.avg_cost ?? c.price ?? "").toString(),
        })),
      );
      setUnknown(result.unknown ?? []);
      setStage("review");
    } catch {
      setStage("idle");
      setMessage({ tone: "error", text: "That PDF could not be read. It may be scanned or password protected." });
    }
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    setStage("saving");
    const chosen = rows
      .filter((row) => row.include)
      .map((row) => ({ symbol: row.symbol, quantity: Number(row.qty), price: Number(row.cost) }));
    const result = await importHoldingsAction(chosen);
    if (result.ok) {
      setRows([]);
      setUnknown([]);
      setStage("idle");
      setMessage({ tone: "ok", text: result.ok });
    } else {
      setStage("review");
      setMessage({ tone: "error", text: result.error ?? "Something went wrong." });
    }
  }

  const chosen = rows.filter((row) => row.include).length;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-base font-bold text-navy-900">Import from a statement</h2>
          <p className="mt-1 text-xs text-slate-500">
            Upload a broker or CDC statement PDF to add its holdings. The file is read in your
            browser and never uploaded; only its text, with account numbers, CNIC, phone numbers
            and emails removed, is sent to our AI provider to find the holdings. You review every
            row before anything is saved.
          </p>
        </div>
        <label
          className={`focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${
            stage === "reading" || stage === "saving" ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <FileUp className="h-4 w-4" aria-hidden />
          {stage === "reading" ? "Reading…" : "Choose PDF"}
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={onFile} />
        </label>
      </div>

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-3 text-sm ${message.tone === "error" ? "text-rose-600" : "text-emerald-700"}`}>
          {message.text}
        </p>
      ) : null}

      {stage === "review" || stage === "saving" ? (
        <div className="mt-4">
          {rows.length ? (
            <div className="table-scroll">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3"><span className="sr-only">Include</span></th>
                    <th className="py-2 pr-3">Stock</th>
                    <th className="py-2 pr-3 text-right">Shares</th>
                    <th className="py-2 pr-3 text-right">Average cost (PKR)</th>
                    <th className="py-2 text-right">Price now</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.symbol} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(event) => update(index, { include: event.target.checked })}
                          aria-label={`Include ${row.symbol}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-navy-900">{row.symbol}</span>
                        <span className="block max-w-[14rem] truncate text-xs text-slate-500">{row.name}</span>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.qty}
                          onChange={(event) => update(index, { qty: event.target.value })}
                          aria-label={`Shares of ${row.symbol}`}
                          className="focus-ring tabular w-24 rounded-md border border-slate-300 px-2 py-1 text-right"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={row.cost}
                          onChange={(event) => update(index, { cost: event.target.value })}
                          aria-label={`Average cost of ${row.symbol}`}
                          className="focus-ring tabular w-28 rounded-md border border-slate-300 px-2 py-1 text-right"
                        />
                        {row.avg_cost === null ? (
                          <span className="block text-[11px] text-amber-700">Not on statement: today&apos;s price used</span>
                        ) : null}
                      </td>
                      <td className="tabular py-2 text-right text-slate-600">{money(row.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No holdings we could match to PSX listings.</p>
          )}
          {unknown.length ? (
            <p className="mt-2 text-xs text-slate-500">
              Not recognised as PSX symbols, so left out: {unknown.join(", ")}. Add them by hand if they are yours.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!chosen || stage === "saving"}
              className="focus-ring rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {stage === "saving" ? "Adding…" : `Add ${chosen} holding${chosen === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setRows([]);
                setUnknown([]);
                setStage("idle");
              }}
              className="focus-ring rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Imported holdings join your positions; buying more of a stock you hold combines at the
            average cost. They are not recorded as trades, because the statement does not show when
            they were bought.
          </p>
        </div>
      ) : null}
    </section>
  );
}
