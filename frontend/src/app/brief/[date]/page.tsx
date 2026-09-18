import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BriefArticle, { briefMetadata } from "@/components/brief/BriefArticle";
import { DATE_PATTERN, briefPath } from "@/lib/briefs";
import { getBriefByDate, listBriefs } from "@/lib/db";

/**
 * The day's closing brief. Until the closing edition exists the morning one
 * is shown here too, with its canonical pointing at its own URL, so the two
 * addresses never compete for the same text.
 */
export const revalidate = 600;

export async function generateStaticParams() {
  const briefs = await listBriefs(20);
  const seen = new Set<string>();
  return briefs
    .filter((brief) => {
      if (seen.has(brief.brief_date)) return false;
      seen.add(brief.brief_date);
      return true;
    })
    .map((brief) => ({ date: brief.brief_date }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) return { title: "Market brief" };

  const brief = await getBriefByDate(date);
  if (!brief) return { title: `PSX market brief for ${date}` };
  return briefMetadata(brief, briefPath(brief));
}

export default async function BriefPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) notFound();

  const brief = await getBriefByDate(date);
  if (!brief) notFound();

  const sibling = brief.session === "morning" ? null : await getBriefByDate(date, "morning");
  return <BriefArticle brief={brief} canonicalPath={briefPath(brief)} sibling={sibling} />;
}
