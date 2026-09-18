import Link from "next/link";
import { Flame, TrendingDown, TrendingUp } from "lucide-react";
import type { Mover, SectorStat } from "@/lib/db";
import { compact, money, percent } from "@/lib/format";
import { SectionHeading } from "@/components/ui/Primitives";

const COLUMNS = [
  { kind: "gainers", label: "Top gainers", icon: TrendingUp, tone: "text-emerald-700" },
  { kind: "losers", label: "Top losers", icon: TrendingDown, tone: "text-rose-600" },
  { kind: "most_active", label: "Most active", icon: Flame, tone: "text-amber-600" },
] as const;

function MoverRow({ mover }: { mover: Mover }) {
  const up = mover.change_pct >= 0;
  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <div className="min-w-0">
        <Link
          href={`/stock/${mover.symbol}`}
          className="flex items-center gap-1.5 text-sm font-semibold text-navy-900 hover:text-emerald-600"
        >
          {mover.symbol}
          {mover.is_kmi ? (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
              title="Shariah compliant"
              aria-label="Shariah compliant"
            />
          ) : null}
        </Link>
        <p className="truncate text-xs text-slate-500">{mover.name || mover.symbol}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tabular text-sm font-semibold text-navy-900">{money(mover.price)}</p>
        <p className={`tabular text-xs font-semibold ${up ? "text-emerald-700" : "text-rose-600"}`}>
          {percent(mover.change_pct)}
        </p>
      </div>
    </li>
  );
}

export default function Movers({
  gainers,
  losers,
  mostActive,
  sectors,
}: {
  gainers: Mover[];
  losers: Mover[];
  mostActive: Mover[];
  sectors: SectorStat[];
}) {
  const data: Record<string, Mover[]> = {
    gainers,
    losers,
    most_active: mostActive,
  };

  if (!gainers.length && !losers.length && !mostActive.length) return null;

  return (
    <section id="movers" className="scroll-mt-20 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Today on the exchange"
          title="Market movers"
          description="The biggest moves and the heaviest volume, straight from the PSX data portal. A green dot marks a Shariah-compliant stock."
        />

        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const rows = data[column.kind] ?? [];
            const Icon = column.icon;
            return (
              <div key={column.kind} className="card p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-navy-900">
                  <Icon className={`h-4 w-4 ${column.tone}`} aria-hidden />
                  {column.label}
                </h3>
                {rows.length ? (
                  <ul>
                    {rows.map((mover) => (
                      <MoverRow key={`${column.kind}-${mover.symbol}`} mover={mover} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-sm text-slate-500">Not available right now.</p>
                )}
              </div>
            );
          })}
        </div>

        {sectors.length ? (
          <div className="card mt-4 p-4">
            <h3 className="mb-3 text-sm font-bold text-navy-900">Sector breadth by turnover</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sectors.map((sector) => {
                const total = sector.advance + sector.decline || 1;
                const advancing = (sector.advance / total) * 100;
                const positive = sector.advance >= sector.decline;
                return (
                  <div key={sector.sector_code} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-navy-900" title={sector.sector_name}>
                        {sector.sector_name}
                      </p>
                      <span
                        className={`tabular shrink-0 text-xs font-semibold ${
                          positive ? "text-emerald-700" : "text-rose-600"
                        }`}
                      >
                        {sector.advance}/{sector.decline}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rose-200">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${advancing}%` }}
                      />
                    </div>
                    <p className="tabular mt-1.5 text-[11px] text-slate-500">
                      Turnover {compact(sector.turnover)} shares
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Advancing versus declining stocks in each sector, ordered by turnover.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
