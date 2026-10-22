"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { LIVE_WINDOW_MINUTES, formatSyncTime, inTradingHours } from "@/lib/marketHours";

const COOLDOWN_MS = 10_000;

function ago(fromMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - fromMs) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

/**
 * When prices were last synced from the exchange, whether that is live, and a
 * Refresh button.
 *
 * Refresh re-reads the latest prices from our database; it does not fetch
 * from the PSX. The pipeline does that every 30 minutes in trading hours, and
 * letting each visitor trigger it would hammer the exchange's portal, which
 * blocks bursts. The page also refreshes itself every `autoSeconds` while the
 * tab is visible, and once when the visitor comes back to it.
 *
 * Anything that depends on the clock renders only after mount, so the server
 * and the browser never disagree about "12 min ago".
 */
export default function PriceSyncStatus({
  syncedAt,
  autoSeconds = 60,
}: {
  syncedAt: string | null;
  autoSeconds?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const clock = window.setInterval(tick, 30_000);
    // Outside the transition, so a background refresh does not spin the button.
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const auto = window.setInterval(refreshIfVisible, autoSeconds * 1000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(auto);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router, autoSeconds]);

  function refresh() {
    const at = Date.now();
    setCheckedAt(at);
    setNow(at);
    startTransition(() => router.refresh());
  }

  const syncedMs = syncedAt ? new Date(syncedAt).getTime() : null;
  const trading = now !== null && inTradingHours(new Date(now));
  const live =
    trading && syncedMs !== null && now - syncedMs <= LIVE_WINDOW_MINUTES * 60_000;
  const coolingDown = checkedAt !== null && now !== null && now - checkedAt < COOLDOWN_MS;

  let dot = "bg-slate-300";
  let note = "";
  if (now !== null) {
    if (syncedMs === null) {
      note = "No prices have been synced from the exchange yet.";
    } else if (live) {
      dot = "bg-emerald-500";
      note = "Live. Prices sync about every 30 minutes, Mon to Fri 9:30am to 3:30pm PKT.";
    } else if (trading) {
      dot = "bg-amber-500";
      note = "No sync for a while during trading hours, so prices may be delayed.";
    } else {
      note = "Market closed. Showing the last prices from the exchange.";
    }
  }

  return (
    <div className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
          {syncedAt ? (
            <span>
              Prices synced {formatSyncTime(syncedAt)}
              {now !== null && syncedMs !== null ? (
                <span className="font-normal text-slate-500"> · {ago(syncedMs, now)}</span>
              ) : null}
            </span>
          ) : (
            <span>Prices not synced yet</span>
          )}
        </p>
        {note ? <p className="mt-0.5 text-xs text-slate-500">{note}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {checkedAt !== null && now !== null && !pending ? (
          <span className="text-xs text-slate-500" role="status">
            Checked {ago(checkedAt, now)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={refresh}
          disabled={pending || coolingDown}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
          {pending ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
