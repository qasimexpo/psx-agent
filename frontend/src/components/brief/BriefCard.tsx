import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import type { BriefRow } from "@/lib/db";
import { longDate, percent, money, changeClass } from "@/lib/format";
import { SectionHeading, SymbolLink } from "@/components/ui/Primitives";
import { briefPath } from "@/lib/briefs";

const SESSION_LABEL: Record<string, string> = {
  morning: "Morning brief",
  closing: "Closing brief",
};

/**
 * The brief is the site's content engine: a dated, indexable page written twice
 * a trading day. On the home page it appears as a summary card that links to
 * the full piece.
 */
export default function BriefCard({ brief }: { brief: BriefRow | null }) {
  if (!brief) return null;

  return (
    <section id="brief" className="scroll-mt-20 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Written by AI, twice every trading day"
          title="Today's market brief"
          action={
            <Link
              href="/brief"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-navy-900 transition hover:border-emerald-300 hover:text-emerald-700"
            >
              All briefs
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />

        <article className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="badge badge-halal">
                <Newspaper className="h-3 w-3" aria-hidden />
                {SESSION_LABEL[brief.session] ?? brief.session}
              </span>
              <span>{longDate(brief.brief_date)}</span>
              {brief.index_value ? (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="tabular">
                    KSE-100 {money(brief.index_value)}{" "}
                    <span className={changeClass(brief.index_change_pct)}>
                      {percent(brief.index_change_pct)}
                    </span>
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h3 className="text-xl font-bold leading-snug text-navy-900">
                <Link href={briefPath(brief)} className="hover:text-emerald-700">
                  {brief.headline}
                </Link>
              </h3>
              <p className="mt-2.5 leading-relaxed text-slate-700">{brief.summary}</p>
              <Link
                href={briefPath(brief)}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Read the full brief
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="lg:col-span-1">
              {brief.key_points.length ? (
                <>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    What matters
                  </p>
                  <ul className="space-y-2">
                    {brief.key_points.slice(0, 4).map((point, index) => (
                      <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {brief.symbols.length ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {brief.symbols.map((symbol) => (
                    <SymbolLink
                      key={symbol}
                      symbol={symbol}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs no-underline"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
