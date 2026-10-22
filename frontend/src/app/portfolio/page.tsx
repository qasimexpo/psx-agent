import type { Metadata } from "next";
import Link from "next/link";
import { BriefcaseBusiness, LockKeyhole, Settings } from "lucide-react";

import AddHoldingForm from "@/components/portfolio/AddHoldingForm";
import HoldingRow from "@/components/portfolio/HoldingRow";
import PriceSyncStatus from "@/components/portfolio/PriceSyncStatus";
import { Disclaimer, EmptyState, SectionHeading, StatTile } from "@/components/ui/Primitives";
import { isAuthConfigured } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/server";
import { getLastPriceSync } from "@/lib/db";
import { percent, pkr, signedMoney } from "@/lib/format";
import { MAX_HOLDINGS, getProfile, listPositions, summarise, type Position } from "@/lib/portfolio";

export const metadata: Metadata = {
  title: "My portfolio",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function tone(value: number | null): "default" | "positive" | "negative" {
  if (!value) return "default";
  return value > 0 ? "positive" : "negative";
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

  const totals = summarise(positions);
  const unpriced = positions.filter((p) => p.price === null).length;

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Market value" value={pkr(totals.value)} hint={`Cost ${pkr(totals.cost)}`} />
            <StatTile
              label="Total profit / loss"
              value={signedMoney(totals.pl)}
              hint={percent(totals.pl_pct)}
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

      <div className="mt-6">
        <AddHoldingForm />
      </div>

      <div className="mt-6">
        {positions.length ? (
          <div className="card table-scroll">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 text-left">Stock</th>
                  <th className="px-3 py-2.5 text-right">Shares</th>
                  <th className="px-3 py-2.5 text-right">Avg cost</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5 text-right">Today</th>
                  <th className="px-3 py-2.5 text-right">Value</th>
                  <th className="px-3 py-2.5 text-right">Profit / loss</th>
                  <th className="px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <HoldingRow key={position.symbol} position={position} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<BriefcaseBusiness className="h-8 w-8" aria-hidden />}
            title="No holdings yet"
            description={`Add the shares you own above to see their value, profit and loss and Shariah status. Up to ${MAX_HOLDINGS} stocks.`}
          />
        )}
      </div>

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
