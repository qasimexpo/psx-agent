import { ExternalLink } from "lucide-react";
import type { EventRow, NewsRow, PayoutRow } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { SectionHeading, SymbolLink } from "@/components/ui/Primitives";

export function EventsSection({
  payouts,
  events,
}: {
  payouts: PayoutRow[];
  events: EventRow[];
}) {
  return (
    <section id="events" className="scroll-mt-20 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="From the PSX data portal"
          title="Dividends and corporate actions"
          description="Announced payouts with their book closure dates, and the meetings where the next ones get decided. Buy before book closure to be eligible."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card overflow-hidden">
            <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-navy-900">
              Upcoming book closures
            </h3>
            {payouts.length ? (
              <div className="table-scroll">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2">Symbol</th>
                      <th className="px-4 py-2">Payout</th>
                      <th className="px-4 py-2">Book closure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((row, index) => (
                      <tr
                        key={`${row.symbol}-${row.book_closure_from}-${index}`}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <SymbolLink symbol={row.symbol} />
                            {row.is_kmi ? (
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                                title="Shariah compliant"
                              />
                            ) : null}
                          </div>
                          <p className="max-w-[14rem] truncate text-xs text-slate-500">
                            {row.company}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-emerald-700">{row.payout}</td>
                        <td className="tabular whitespace-nowrap px-4 py-2.5 text-slate-700">
                          {shortDate(row.book_closure_from)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-8">
                <p className="text-sm text-slate-500">
                  No payouts with an upcoming book closure right now.
                </p>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-navy-900">
              Shareholder meetings
            </h3>
            {events.length ? (
              <div className="table-scroll">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2">Symbol</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((row, index) => (
                      <tr
                        key={`${row.symbol}-${row.event_date}-${index}`}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <SymbolLink symbol={row.symbol} />
                            {row.is_kmi ? (
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                                title="Shariah compliant"
                              />
                            ) : null}
                          </div>
                          <p className="max-w-[14rem] truncate text-xs text-slate-500">
                            {row.company}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="badge badge-neutral">{row.event_type}</span>
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-2.5 text-slate-700">
                          {shortDate(row.event_date)}
                          {row.event_time ? (
                            <span className="block text-xs text-slate-400">{row.event_time}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-8">
                <p className="text-sm text-slate-500">No meetings scheduled in the near term.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function NewsSection({ pakistan, global }: { pakistan: NewsRow[]; global: NewsRow[] }) {
  if (!pakistan.length && !global.length) return null;

  const columns = [
    { title: "Pakistan markets", items: pakistan },
    { title: "Global markets", items: global },
  ];

  return (
    <section id="news" className="scroll-mt-20 bg-white px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Updated through the day"
          title="Market news"
          description="Headlines that move the KSE-100 and the global backdrop behind them."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {columns.map((column) => (
            <div key={column.title} className="card p-5">
              <h3 className="mb-3 text-sm font-bold text-navy-900">{column.title}</h3>
              {column.items.length ? (
                <ul className="space-y-4">
                  {column.items.map((item, index) => (
                    <li
                      key={`${item.link}-${index}`}
                      className="border-b border-slate-100 pb-4 last:border-0 last:pb-0"
                    >
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="group flex items-start justify-between gap-3"
                      >
                        <span>
                          <span className="text-sm font-semibold leading-snug text-navy-900 group-hover:text-emerald-700">
                            {item.title}
                          </span>
                          <span className="mt-1 block text-xs uppercase tracking-wide text-slate-400">
                            {item.source}
                          </span>
                        </span>
                        <ExternalLink
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-emerald-600"
                          aria-hidden
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No headlines available.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
