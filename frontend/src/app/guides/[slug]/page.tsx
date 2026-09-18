import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import GoogleAd from "@/components/GoogleAd";
import { Disclaimer } from "@/components/ui/Primitives";
import { AD_SLOT_ARTICLE } from "@/lib/adsense";
import { longDate } from "@/lib/format";
import { getGuide, listGuides } from "@/lib/guides";
import { EDITOR, SITE_URL } from "@/lib/site";

export async function generateStaticParams() {
  const guides = await listGuides();
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) return { title: "Guide" };

  const images = guide.image
    ? [{ url: guide.image, width: 1200, height: 630, alt: guide.imageAlt }]
    : [{ url: "/images/og-default.jpg", width: 1200, height: 630 }];
  return {
    title: { absolute: guide.title },
    description: guide.description,
    keywords: guide.keywords,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: `${SITE_URL}/guides/${guide.slug}`,
      type: "article",
      publishedTime: guide.date,
      modifiedTime: guide.updated,
      images,
    },
    twitter: { card: "summary_large_image", images },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) notFound();

  const all = await listGuides();
  const related = guide.related.length
    ? all.filter((item) => guide.related.includes(item.slug))
    : all.filter((item) => item.slug !== guide.slug).slice(0, 3);

  const url = `${SITE_URL}/guides/${guide.slug}`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    image: [`${SITE_URL}${guide.image ?? "/images/og-default.jpg"}`],
    datePublished: guide.date,
    dateModified: guide.updated,
    wordCount: guide.wordCount,
    keywords: guide.keywords.join(", "),
    inLanguage: "en",
    isAccessibleForFree: true,
    // Guides are written and maintained by the editor, unlike the briefs.
    author: { "@type": "Person", "@id": EDITOR.id, name: EDITOR.name, url: EDITOR.url },
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "SmartSarmaya",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/images/logo-512.png` },
    },
    mainEntityOfPage: url,
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
      { "@type": "ListItem", position: 3, name: guide.title, item: url },
    ],
  };

  return (
    <article className="px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      <div className="mx-auto max-w-3xl">
        <Link
          href="/guides"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All guides
        </Link>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="badge badge-halal">
            <BookOpen className="h-3 w-3" aria-hidden />
            Guide
          </span>
          <span>
            By{" "}
            <Link href={EDITOR.url} className="font-semibold text-navy-900 hover:text-emerald-700">
              {EDITOR.name}
            </Link>
          </span>
          <span>
            Updated <time dateTime={guide.updated}>{longDate(guide.updated)}</time>
          </span>
          <span>{guide.readingMinutes} min read</span>
        </div>

        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-navy-900 sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-700">{guide.description}</p>

        {guide.sections.length > 2 ? (
          <nav aria-label="In this guide" className="card mt-6 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              In this guide
            </p>
            <ol className="mt-2 space-y-1 text-sm">
              {guide.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-navy-900 hover:text-emerald-700">
                    {section.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div
          className="guide-body mt-8 text-[15px]"
          dangerouslySetInnerHTML={{ __html: guide.html }}
        />

        <GoogleAd slot={AD_SLOT_ARTICLE} className="mt-8" />

        {related.length ? (
          <div className="mt-8 border-t border-slate-200 pt-5">
            <p className="mb-2 text-sm font-semibold text-navy-900">Keep reading</p>
            <ul className="space-y-1.5">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/guides/${item.slug}`}
                    className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Disclaimer className="mt-8 border-t border-slate-200 pt-5" />
      </div>
    </article>
  );
}
