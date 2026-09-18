import type { BriefRow } from "@/lib/db";

/**
 * The exchange gets two briefs a day and they used to share one URL, which
 * left the morning edition unreachable by anything but the listing page. The
 * closing edition lives at /brief/<date> and the morning one at
 * /brief/<date>/morning.
 */

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function briefPath(brief: Pick<BriefRow, "brief_date" | "session">): string {
  return brief.session === "morning"
    ? `/brief/${brief.brief_date}/morning`
    : `/brief/${brief.brief_date}`;
}
