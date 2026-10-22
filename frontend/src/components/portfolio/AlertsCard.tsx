import { BellRing, X } from "lucide-react";

import { deleteAlertAction } from "@/app/portfolio/actions";
import { SymbolLink } from "@/components/ui/Primitives";
import { pkr, percent, relativeTime } from "@/lib/format";
import type { PriceAlert } from "@/lib/portfolio";

/** Waiting and fired price alerts, each removable. */
export default function AlertsCard({ alerts, emails }: { alerts: PriceAlert[]; emails: boolean }) {
  const waiting = alerts.filter((a) => !a.triggered_at);
  const fired = alerts.filter((a) => a.triggered_at);

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-1.5 text-base font-bold text-navy-900">
        <BellRing className="h-4 w-4 text-slate-500" aria-hidden />
        Price alerts
      </h2>
      {alerts.length ? (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {[...fired, ...waiting].map((alert) => {
            const distance =
              !alert.triggered_at && alert.price ? ((alert.target - alert.price) / alert.price) * 100 : null;
            return (
              <li key={alert.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <SymbolLink symbol={alert.symbol} />{" "}
                  <span className="text-slate-700">
                    {alert.direction} {pkr(alert.target)}
                  </span>
                  <p className="text-xs text-slate-500">
                    {alert.triggered_at
                      ? `Fired ${relativeTime(alert.triggered_at)} at ${pkr(alert.triggered_price)}`
                      : `Waiting · now ${pkr(alert.price)}${distance !== null ? `, ${percent(distance)} to go` : ""}`}
                  </p>
                </div>
                {alert.triggered_at ? (
                  <span className="badge bg-amber-50 text-amber-800">Fired</span>
                ) : (
                  <span className="badge badge-neutral">Waiting</span>
                )}
                <form action={deleteAlertAction}>
                  <input type="hidden" name="id" value={alert.id} />
                  <button
                    type="submit"
                    aria-label={`Delete the ${alert.symbol} ${alert.direction} ${alert.target} alert`}
                    className="focus-ring rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No alerts yet. Open any stock page and use Price alert to be told when it crosses a price.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {emails
          ? "Alerts are checked each time prices update and email you once when they fire."
          : "Alerts are checked each time prices update and show here once when they fire."}
      </p>
    </section>
  );
}
