import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Disclaimer, EmptyState, SectionHeading } from "@/components/ui/Primitives";
import { listGuides } from "@/lib/guides";
import { shortDate } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Guides to halal investing on the PSX",
  description:
    "Plain-language guides to the Pakistan Stock Exchange: how Shariah screening works, what the indices mean, how to read a stock page, and how to use every tool on this site.",
  alternates: { canonical: "/guides" },
};

export default async function GuidesPage() {
  const guides = await listGuides();

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "SmartSarmaya guides",
    itemListElement: guides.map((guide, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: guide.title,
      url: `${SITE_URL}/guides/${guide.slug}`,
    })),
  };

  return (
    <div className="px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          as="h1"
          eyebrow="Guides"
          title="Halal investing on the PSX, explained"
          description="Short, specific answers to the questions people ask before they buy a Pakistani stock: how the Shariah screen works, what the indices mean, and how to read the numbers on a company page."
        />

        {guides.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {guides.map((guide) => (
              <article key={guide.slug} className="card card-hover flex flex-col p-5">
                <p className="text-xs text-slate-500">
                  {shortDate(guide.updated)} · {guide.readingMinutes} min read
                </p>
                <h2 className="mt-2 text-lg font-bold leading-snug text-navy-900">
                  <Link href={`/guides/${guide.slug}`} className="hover:text-emerald-700">
                    {guide.title}
                  </Link>
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  {guide.description}
                </p>
                <Link
                  href={`/guides/${guide.slug}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Read the guide
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BookOpen className="h-9 w-9" />}
            title="No guides yet"
            description="Guides are Markdown files in content/guides. Add one and it appears here."
          />
        )}

        <Disclaimer className="mt-8" />
      </div>
    </div>
  );
}
