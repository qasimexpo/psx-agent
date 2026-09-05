import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { listBriefs } from "@/lib/db";
import { changeClass, longDate, money, percent } from "@/lib/format";
import { Disclaimer, EmptyState, SectionHeading } from "@/components/ui/Primitives";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Daily PSX market brief",
  description:
    "AI written briefs on the Pakistan Stock Exchange, published before the open and after the close every trading day. KSE-100 moves, the biggest movers and what they mean.",
  alternates: { canonical: "/brief" },
};

const SESSION_LABEL: Record<string, string> = {
  morning: "Morning",
  closing: "Closing",
};

export default async function BriefIndexPage() {
  const briefs = await listBriefs(40);

  return (
    <div className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          eyebrow="Twice every trading day"
          title="PSX market brief"
          description="A short, specific read on what the Pakistan Stock Exchange did and why. Written from live exchange data before the open and after the close."
        />

        {briefs.length ? (
          <div className="space-y-3">
            {briefs.map((brief) => (
              <article
                key={`${brief.brief_date}-${brief.session}`}
                className="card card-hover p-5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="badge badge-halal">
                    <Newspaper className="h-3 w-3" aria-hidden />
                    {SESSION_LABEL[brief.session] ?? brief.session}
                  </span>
                  <time dateTime={brief.brief_date}>{longDate(brief.brief_date)}</time>
                  {brief.index_value ? (
                    <span className="tabular">
                      KSE-100 {money(brief.index_value)}{" "}
                      <span className={changeClass(brief.index_change_pct)}>
                        {percent(brief.index_change_pct)}
                      </span>
                    </span>
                  ) : null}
                </div>

                <h2 className="text-lg font-bold leading-snug text-navy-900">
                  <Link href={`/brief/${brief.brief_date}`} className="hover:text-emerald-700">
                    {brief.headline}
                  </Link>
                </h2>
                <p className="mt-1.5 leading-relaxed text-slate-600">{brief.summary}</p>
                <Link
                  href={`/brief/${brief.brief_date}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Read the brief
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Newspaper className="h-9 w-9" />}
            title="No briefs published yet"
            description="Briefs appear once the pipeline has run. The morning edition publishes at 08:45 and the closing edition at 16:15, Pakistan time."
          />
        )}

        <Disclaimer className="mt-8" />
      </div>
    </div>
  );
}
