"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { changeClass, money, percent } from "@/lib/format";

export type DirectoryRow = {
  symbol: string;
  name: string;
  sector_name: string;
  is_kmi: boolean;
  current_price: number;
  change_pct: number;
};

const subscribeNever = () => () => {};
const readQueryParam = () => new URLSearchParams(window.location.search).get("q") ?? "";
const readNothing = () => "";

/**
 * Filtering happens in the browser over data the server already rendered, so
 * the page stays static and the filters cost nothing.
 */
export default function StockDirectory({ rows }: { rows: DirectoryRow[] }) {
  const [halalOnly, setHalalOnly] = useState(false);
  // /stocks?q=PPL is the site search target advertised in the WebSite
  // schema. The URL seeds the box until the reader types; reading it this
  // way keeps the page static and hydrates without a mismatch, because the
  // server snapshot is always empty.
  const urlTerm = useSyncExternalStore(subscribeNever, readQueryParam, readNothing);
  const [typed, setTyped] = useState<string | null>(null);
  const term = typed ?? urlTerm;

  const filtered = useMemo(() => {
    const needle = term.trim().toUpperCase();
    return rows.filter((row) => {
      if (halalOnly && !row.is_kmi) return false;
      if (!needle) return true;
      return row.symbol.includes(needle) || row.name.toUpperCase().includes(needle);
    });
  }, [rows, halalOnly, term]);

  const sectors = useMemo(() => {
    const grouped = new Map<string, DirectoryRow[]>();
    for (const row of filtered) {
      const sector = row.sector_name || "Unclassified";
      grouped.set(sector, [...(grouped.get(sector) ?? []), row]);
    }
    return [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={term}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Search symbol or company"
            aria-label="Search stocks"
            className="focus-ring w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            {filtered.length} of {rows.length}
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-navy-900">
            <input
              type="checkbox"
              checked={halalOnly}
              onChange={(event) => setHalalOnly(event.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            Shariah compliant only
          </label>
        </div>
      </div>

      {sectors.length ? (
        <div className="space-y-6">
          {sectors.map(([sector, items]) => (
            <section key={sector}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                {sector}
                <span className="ml-2 font-normal normal-case text-slate-500">{items.length}</span>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((row) => (
                  <Link
                    key={row.symbol}
                    href={`/stock/${row.symbol}`}
                    className="card card-hover flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-navy-900">{row.symbol}</span>
                        {row.is_kmi ? (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                            title="Shariah compliant"
                          />
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-slate-500">{row.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm font-semibold text-navy-900">
                        {money(row.current_price)}
                      </p>
                      <p className={`tabular text-xs font-semibold ${changeClass(row.change_pct)}`}>
                        {percent(row.change_pct)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card px-6 py-10 text-center">
          <p className="font-semibold text-navy-900">Nothing matches that search</p>
          <p className="mt-1 text-sm text-slate-500">
            Try a different symbol or clear the Shariah filter.
          </p>
        </div>
      )}
    </>
  );
}
