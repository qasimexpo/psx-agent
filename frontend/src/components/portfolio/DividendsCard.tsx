import { SymbolLink } from "@/components/ui/Primitives";
import { FACE_VALUE, type DividendLine } from "@/lib/dividends";
import { money, pkr, shortDate } from "@/lib/format";

/** Cash dividends received this year and announced ahead, for stocks held. */
export default function DividendsCard({ lines, year }: { lines: DividendLine[]; year: string }) {
  const received = lines.filter((l) => l.status === "received" && l.day.startsWith(year));
  const upcoming = lines.filter((l) => l.status === "upcoming");
  const total = (items: DividendLine[]) => items.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  const shown = [...upcoming, ...[...received].reverse()];

  return (
    <section className="card p-5">
      <h2 className="text-base font-bold text-navy-900">Dividend income</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Received in {year}</p>
          <p className="mt-1 text-lg font-bold text-navy-900">{pkr(total(received))}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Announced, coming</p>
          <p className="mt-1 text-lg font-bold text-navy-900">{pkr(total(upcoming))}</p>
        </div>
      </div>

      {shown.length ? (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {shown.slice(0, 10).map((line) => (
            <li key={`${line.symbol}-${line.day}-${line.payout}`} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <SymbolLink symbol={line.symbol} /> <span className="text-slate-600">{line.payout}</span>
                <p className="text-xs text-slate-500">
                  {line.status === "upcoming" ? "Book closure from " : "Book closure "}
                  {shortDate(line.day)} · {line.shares.toLocaleString("en-PK")} shares
                  {line.perShare !== null ? ` × Rs ${money(line.perShare)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular font-semibold text-navy-900">
                  {line.amount === null ? "No cash" : pkr(line.amount)}
                </p>
                <p className="text-xs text-slate-500">{line.status === "upcoming" ? "Coming" : "Received"}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No cash dividends this year or announced for the stocks you hold.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Estimates: amounts assume a Rs {FACE_VALUE} face value and are before tax. Shares are counted
        from your recorded trades, so check the company&apos;s notice for the exact figure.
      </p>
    </section>
  );
}
