import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BriefArticle, { briefMetadata } from "@/components/brief/BriefArticle";
import { DATE_PATTERN } from "@/lib/briefs";
import { getBriefByDate, listBriefs } from "@/lib/db";

/** The day's morning brief, written before the open. */
export const revalidate = 600;

export async function generateStaticParams() {
  const briefs = await listBriefs(40);
  return briefs
    .filter((brief) => brief.session === "morning")
    .map((brief) => ({ date: brief.brief_date }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) return { title: "Morning brief" };

  const brief = await getBriefByDate(date, "morning");
  if (!brief) return { title: `PSX morning brief for ${date}` };
  return briefMetadata(brief, `/brief/${date}/morning`);
}

export default async function MorningBriefPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) notFound();

  const brief = await getBriefByDate(date, "morning");
  if (!brief) notFound();

  const sibling = await getBriefByDate(date, "closing");
  return <BriefArticle brief={brief} canonicalPath={`/brief/${date}/morning`} sibling={sibling} />;
}
