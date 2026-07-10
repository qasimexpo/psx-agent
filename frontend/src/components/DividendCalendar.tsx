"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays } from "lucide-react";
import {
  fetchNewsAndEvents,
  toDividendRow,
  type DividendCalendarItem,
} from "@/lib/api";

export default function DividendCalendar() {
  const [rows, setRows] = useState<DividendCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dividends, meetings] = await Promise.all([
          fetchNewsAndEvents("dividend"),
          fetchNewsAndEvents("board_meeting"),
        ]);
        if (cancelled) return;

        setRows([...dividends, ...meetings].map(toDividendRow));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load upcoming events.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="dividends-events" className="scroll-mt-20 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold text-navy-950 sm:text-3xl">
          Upcoming PSX Dividends & Board Meetings
        </h2>
        <p className="mt-2 text-slate-600">Stay ahead of payouts and corporate actions.</p>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          {error && (
            <div className="flex items-start gap-2 px-5 py-6 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {!error && !loading && rows.length === 0 && (
            <div className="flex items-center gap-3 px-5 py-8 text-slate-500">
              <CalendarDays className="h-5 w-5 text-slate-400" />
              <p className="text-sm font-medium">No upcoming dividends announced recently.</p>
            </div>
          )}

          {!error && rows.length > 0 && (
            <div className="transition-opacity duration-150 opacity-100">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">Company Symbol</th>
                    <th className="px-4 py-3">Event Type</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={`${row.symbol}-${row.event_type}-${row.date}-${index}`}
                      className="border-t border-slate-100 transition hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-navy-950">
                        {row.symbol}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.event_type}</td>
                      <td className="px-4 py-3 text-slate-600">{row.details}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!error && loading && rows.length === 0 && (
            <div className="h-24 transition-opacity duration-150 opacity-40" aria-hidden />
          )}
        </div>
      </div>
    </section>
  );
}
