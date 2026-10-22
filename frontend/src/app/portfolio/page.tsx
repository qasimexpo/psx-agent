import type { Metadata } from "next";
import Link from "next/link";
import { BriefcaseBusiness, LockKeyhole, Settings } from "lucide-react";

import Donut from "@/components/charts/Donut";
import DividendsCard from "@/components/portfolio/DividendsCard";
import HoldingRow from "@/components/portfolio/HoldingRow";
import PortfolioPerformance from "@/components/portfolio/PortfolioPerformance";
import PriceSyncStatus from "@/components/portfolio/PriceSyncStatus";
import TradeForm from "@/components/portfolio/TradeForm";
import TradesCard from "@/components/portfolio/TradesCard";
import UpcomingEvents from "@/components/portfolio/UpcomingEvents";
import WatchlistCard from "@/components/portfolio/WatchlistCard";
import { Disclaimer, EmptyState, SectionHeading, StatTile } from "@/components/ui/Primitives";
import { isAuthConfigured } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/server";
import {
  changePct,
  foldSlices,
  holdingsValueSeries,
  sliceRange,
  withLatest,
  type PricePoint,
} from "@/lib/charts";
import { getIndexHistory, getLastPriceSync, getPriceHistories, getUpcomingFor } from "@/lib/db";
import { dividendLines } from "@/lib/dividends";
import { todayPkt } from "@/lib/marketHours";
import { percent, pkr, signedMoney } from "@/lib/format";
import {
  MAX_HOLDINGS,
  getProfile,
  listPayoutsFor,
  listPositions,
  listTrades,
  listWatch,
  summarise,
  type Position,
} from "@/lib/portfolio";

export const metadata: Metadata = {
  title: "My portfolio",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function tone(value: number | null): "default" | "positive" | "negative" {
  if (!value) return "default";
  return value > 0 ? "positive" : "negative";
}

/** A secondary read: on failure its section shows empty and the rest of the page still loads. */
function orEmpty<T>(what: string, promise: Promise<T[]>): Promise<T[]> {
  return promise.catch((error) => {
    console.error(`[portfolio] ${what} failed:`, error instanceof Error ? error.message : error);
    return [];
  });
}

export default async function PortfolioPage() {
  if (!isAuthConfigured()) {
    return (
      <Shell>
        <EmptyState
          icon={<LockKeyhole className="h-8 w-8" aria-hidden />}
          title="Accounts are not switched on yet"
          description="Saved portfolios will be available shortly. Meanwhile the free portfolio audit on the home page works without an account."
        />
      </Shell>
    );
  }

  const user = await requireUser("/portfolio");

  let positions: Position[];
  let displayName = user.name;
  let lastSync: string | null = null;
  try {
    const [rows, profile, syncedAt] = await Promise.all([
      listPositions(user.id),
      getProfile(user.id),
      getLastPriceSync(),
    ]);
    positions = rows;
    displayName = profile?.display_name || user.name;
    lastSync = syncedAt;
  } catch (error) {
    console.error("[portfolio] load failed:", error instanceof Error ? error.message : error);
    return (
      <Shell>
        <EmptyState
          title="We could not load your portfolio"
          description="Your holdings are safe. This is a temporary problem reaching the database; refresh the page in a minute."
        />
      </Shell>
    );
  }

  const [trades, watched] = await Promise.all([
    orEmpty("trades", listTrades(user.id)),
    orEmpty("watchlist", listWatch(user.id)),
  ]);
  const held = positions.map((p) => p.symbol);
  const owned = [...new Set([...held, ...trades.map((t) => t.symbol)])];
  const [histories, kse100, upcoming, payouts] = await Promise.all([
    getPriceHistories([...owned, ...watched.map((w) => w.symbol)]),
    getIndexHistory("KSE100", 260),
    getUpcomingFor(held),
    orEmpty("payouts", listPayoutsFor(owned)),
  ]);

  const totals = summarise(positions);
  const unpriced = positions.filter((p) => p.price === null).length;
  const realized = trades.reduce((sum, t) => sum + (t.realized_pl ?? 0), 0);
  const today = todayPkt();

  const closes: Record<string, PricePoint[]> = Object.fromEntries(
    owned.map((symbol) => {
      const position = positions.find((p) => p.symbol === symbol);
      return [symbol, withLatest(histories[symbol] ?? [], position?.price ?? null, position?.quote_at ?? null)];
    }),
  );
  const valueSeries = holdingsValueSeries(positions, closes, trades);
  const benchmark = kse100.map(({ day, value }) => ({ t: day, v: value }));
  const watchRows = watched.map((w) => {
    const trend = sliceRange(withLatest(histories[w.symbol] ?? [], w.price, w.quote_at), "3M");
    return { ...w, trend, trendChange: changePct(trend) };
  });

  const bySector = new Map<string, number>();
  for (const p of positions) {
    const sector = p.sector_name || "Unclassified";
    bySector.set(sector, (bySector.get(sector) ?? 0) + p.value);
  }

  return (
    <Shell>
      <SectionHeading
        as="h1"
        eyebrow={`Signed in as ${displayName || user.email}`}
        title="My portfolio"
        description="Your PSX holdings valued at the latest exchange prices. The page refreshes itself every minute while it is open."
        action={
          <Link
            href="/account"
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" aria-hidden />
            Account
          </Link>
        }
      />

      <div className="mb-4">
        <PriceSyncStatus syncedAt={lastSync} />
      </div>

      {positions.length ? (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Market value" value={pkr(totals.value)} hint={`Cost ${pkr(totals.cost)}`} />
            <StatTile
              label="Open profit / loss"
              value={signedMoney(totals.pl)}
              hint={
                trades.length
                  ? `${percent(totals.pl_pct)} · realised ${signedMoney(realized)}`
                  : percent(totals.pl_pct)
              }
              tone={tone(totals.pl)}
            />
            <StatTile
              label="Today"
              value={signedMoney(totals.day_change)}
              hint={percent(totals.day_change_pct)}
              tone={tone(totals.day_change)}
            />
            <StatTile
              label="Shariah compliant"
              value={percent(totals.shariah_pct, false)}
              hint="of value in KMI All Shares stocks"
            />
          </div>
          {unpriced ? (
            <p className="mt-3 text-xs text-slate-500">
              {unpriced} holding{unpriced > 1 ? "s have" : " has"} no current quote from the
              exchange and {unpriced > 1 ? "are" : "is"} valued at cost.
            </p>
          ) : null}
        </>
      ) : null}

      {valueSeries.length ? (
        <div className="mt-6">
          <PortfolioPerformance value={valueSeries} benchmark={benchmark} usesTrades={trades.length > 0} />
        </div>
      ) : null}

      {positions.length ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Donut
            title="By stock"
            centerLabel={positions.length === 1 ? "stock" : "stocks"}
            slices={foldSlices(positions.map((p) => ({ label: p.symbol, value: p.value })))}
          />
          <Donut
            title="By sector"
            centerLabel={bySector.size === 1 ? "sector" : "sectors"}
            slices={foldSlices([...bySector].map(([label, value]) => ({ label, value })))}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <TradeForm today={today} />
      </div>

      <div className="mt-6">
        {positions.length ? (
          <div className="card table-scroll">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 text-left">Stock</th>
                  <th className="px-3 py-2.5 text-left">3 months</th>
                  <th className="px-3 py-2.5 text-right">Shares</th>
                  <th className="px-3 py-2.5 text-right">Avg cost</th>
                  <th className="px-3 py-2.5 text-right">Price · today</th>
                  <th className="px-3 py-2.5 text-right">Value</th>
                  <th className="px-3 py-2.5 text-right">Profit / loss</th>
                  <th className="px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => {
                  const trend = sliceRange(closes[position.symbol], "3M");
                  return (
                    <HoldingRow
                      key={position.symbol}
                      position={position}
                      weight={totals.value > 0 ? (position.value / totals.value) * 100 : null}
                      trend={trend}
                      trendChange={changePct(trend)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<BriefcaseBusiness className="h-8 w-8" aria-hidden />}
            title="No holdings yet"
            description={`Record a buy above to see its value, profit and loss and Shariah status. Up to ${MAX_HOLDINGS} stocks.`}
          />
        )}
      </div>

      <div className="mt-6">
        <WatchlistCard rows={watchRows} />
      </div>

      <div className="mt-6">
        <TradesCard trades={trades} />
      </div>

      {owned.length ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <DividendsCard lines={dividendLines(payouts, positions, trades, today)} year={today.slice(0, 4)} />
          <UpcomingEvents items={upcoming.filter((item) => item.kind === "meeting")} />
        </div>
      ) : null}

      <Disclaimer className="mt-10" />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}
