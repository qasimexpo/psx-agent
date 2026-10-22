import { CalendarDays, Coins } from "lucide-react";

import { SymbolLink } from "@/components/ui/Primitives";
import type { UpcomingItem } from "@/lib/db";
import { shortDate } from "@/lib/format";

/** Book closures and meetings coming up for the stocks a user holds. */
export default function UpcomingEvents({ items }: { items: UpcomingItem[] }) {
  return (
    <section className="card p-5">
      <h2 className="text-base font-bold text-navy-900">Coming up for your stocks</h2>
      {items.length ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.slice(0, 8).map((item) => (
            <li key={`${item.symbol}-${item.kind}-${item.day}-${item.detail}`} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                {item.kind === "payout" ? (
                  <Coins className="h-4 w-4" aria-hidden />
                ) : (
                  <CalendarDays className="h-4 w-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <SymbolLink symbol={item.symbol} />{" "}
                <span className="text-slate-700">
                  {item.kind === "payout" ? `payout ${item.detail}` : item.detail}
                </span>
                <p className="text-xs text-slate-500">
                  {item.kind === "payout" ? "Book closure from " : "On "}
                  {shortDate(item.day)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No dividends, book closures or meetings announced for your stocks right now.
        </p>
      )}
    </section>
  );
}
