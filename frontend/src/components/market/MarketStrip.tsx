import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { IndexSnapshot, Quote } from "@/lib/db";
import { changeClass, money, percent, relativeTime } from "@/lib/format";
import { Sparkline } from "@/components/ui/Primitives";

/**
 * The market strip is rendered on the server from the database, so the numbers
 * are in the HTML that search engines and ad reviewers receive. The previous
 * version fetched on the client, which meant the page arrived empty.
 */

function TickerItem({ quote }: { quote: Quote }) {
  const up = quote.change_pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <Link
      href={`/stock/${quote.symbol}`}
      className="mx-1 flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition hover:border-slate-300"
    >
      <span className="text-sm font-bold text-navy-900">{quote.symbol}</span>
      <span className="tabular text-sm text-slate-600">{money(quote.current_price)}</span>
      <span className={`tabular flex items-center gap-0.5 text-xs font-semibold ${changeClass(quote.change_pct)}`}>
        <Icon className="h-3 w-3" aria-hidden />
        {percent(Math.abs(quote.change_pct), false)}
      </span>
    </Link>
  );
}

export function Ticker({ quotes }: { quotes: Quote[] }) {
  if (!quotes.length) return null;
  // The track is duplicated so the CSS animation can loop seamlessly.
  const track = [...quotes, ...quotes];

  return (
    <div className="ticker-viewport overflow-hidden border-y border-slate-200 bg-slate-50 py-2">
      <div className="ticker-track">
        {track.map((quote, index) => (
          <TickerItem key={`${quote.symbol}-${index}`} quote={quote} />
        ))}
      </div>
    </div>
  );
}

export function MarketStatus({ updatedAt }: { updatedAt: string | null }) {
  // PSX trades 09:30-15:30 PKT, Monday to Friday.
  const now = new Date();
  const pkt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  const day = pkt.getDay();
  const minutes = pkt.getHours() * 60 + pkt.getMinutes();
  const open = day >= 1 && day <= 5 && minutes >= 570 && minutes <= 930;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span
        className={`h-2 w-2 rounded-full ${open ? "bg-emerald-500" : "bg-slate-400"}`}
        aria-hidden
      />
      {open ? "Market open" : "Market closed"}
      <span className="text-slate-400">·</span>
      <span>Updated {relativeTime(updatedAt)}</span>
    </span>
  );
}

export function IndexCard({
  index,
  halalCount,
  totalCount,
  updatedAt,
}: {
  index: IndexSnapshot | null;
  halalCount: number;
  totalCount: number;
  updatedAt: string | null;
}) {
  const up = (index?.change ?? 0) >= 0;

  return (
    <div className="panel-dark overflow-hidden rounded-[var(--radius-card)] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="eyebrow eyebrow-on-dark">Pakistan Stock Exchange</p>
          <h2 className="mt-1 text-lg font-semibold text-white">KSE-100 Index</h2>

          {index ? (
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <p className="tabular text-3xl font-bold text-white sm:text-4xl">
                {money(index.value)}
              </p>
              <span
                className={`tabular inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${
                  up ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                }`}
              >
                {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {money(Math.abs(index.change))} ({percent(index.change_pct)})
              </span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              Index data will appear after the next pipeline run.
            </p>
          )}

          <div className="mt-3 text-xs text-slate-400">
            <MarketStatusDark updatedAt={updatedAt} />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:gap-6">
          {index && index.sparkline.length > 1 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Intraday
              </p>
              <Sparkline values={index.sparkline} width={200} height={48} className="h-12 w-52" />
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="tabular text-2xl font-bold text-emerald-300">{halalCount}</p>
            <p className="text-[11px] leading-tight text-slate-400">
              Shariah compliant
              <br />
              of {totalCount} listed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketStatusDark({ updatedAt }: { updatedAt: string | null }) {
  const now = new Date();
  const pkt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  const day = pkt.getDay();
  const minutes = pkt.getHours() * 60 + pkt.getMinutes();
  const open = day >= 1 && day <= 5 && minutes >= 570 && minutes <= 930;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${open ? "bg-emerald-400" : "bg-slate-500"}`} aria-hidden />
      {open ? "Market open" : "Market closed"}
      <span className="text-slate-600">·</span>
      <span>Data updated {relativeTime(updatedAt)}</span>
    </span>
  );
}
