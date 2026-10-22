import { SymbolLink } from "@/components/ui/Primitives";
import { changeClass, money, shortDate, signedMoney } from "@/lib/format";
import type { Trade } from "@/lib/portfolio";

const SHOWN = 20;

/** Realised profit and the latest recorded trades, newest first. */
export default function TradesCard({ trades }: { trades: Trade[] }) {
  const realized = trades.reduce((sum, t) => sum + (t.realized_pl ?? 0), 0);
  const recent = [...trades].reverse().slice(0, SHOWN);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-navy-900">Trade history</h2>
        <p className="text-sm text-slate-600">
          Realised profit / loss{" "}
          <span className={`tabular font-semibold ${changeClass(realized)}`}>{signedMoney(realized)}</span>
        </p>
      </div>
      {recent.length ? (
        <div className="table-scroll mt-3">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Trade</th>
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3 text-right">Shares</th>
                <th className="py-2 pr-3 text-right">Price</th>
                <th className="py-2 text-right">Realised</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {recent.map((trade) => (
                <tr key={trade.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-600">{shortDate(trade.trade_date)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`badge ${trade.side === "buy" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                    >
                      {trade.side === "buy" ? "Buy" : "Sell"}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <SymbolLink symbol={trade.symbol} />
                  </td>
                  <td className="py-2 pr-3 text-right">{trade.quantity.toLocaleString("en-PK")}</td>
                  <td className="py-2 pr-3 text-right">{money(trade.price)}</td>
                  <td className={`py-2 text-right ${changeClass(trade.realized_pl)}`}>
                    {trade.realized_pl === null ? "—" : signedMoney(trade.realized_pl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trades.length > SHOWN ? (
            <p className="mt-2 text-xs text-slate-500">Showing the latest {SHOWN} of {trades.length} trades.</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No trades yet. Record buys and sells above to track realised profit and see your account
          value change on the dates you traded.
        </p>
      )}
    </section>
  );
}
