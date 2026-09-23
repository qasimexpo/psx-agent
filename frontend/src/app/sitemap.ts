import type { MetadataRoute } from "next";
import { getMarketStats, listBriefs, listSitemapSymbols } from "@/lib/db";
import { briefPath } from "@/lib/briefs";
import { listGuides } from "@/lib/guides";
import { PICK_SECTORS } from "@/lib/sectors";
import { SITE_URL } from "@/lib/site";

/**
 * The sitemap is generated from the database, so every stock page and every
 * published brief is submitted to search engines automatically as the pipeline
 * creates them.
 *
 * A metadata route is prerendered once at build time unless it opts into
 * dynamic rendering; `revalidate` alone did not do that here, and production
 * served the sitemap from the deploy for ten days while new briefs went
 * unlisted. Crawlers fetch this a few times a day, so rendering it per request
 * costs three indexed queries and nothing else.
 */
export const dynamic = "force-dynamic";

const asDate = (value: string | null | undefined): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const latest = (...dates: (Date | undefined)[]): Date | undefined =>
  dates
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [symbols, briefs, market, guides] = await Promise.all([
    listSitemapSymbols(),
    listBriefs(240),
    getMarketStats(),
    listGuides(),
  ]);

  // lastmod only helps when it tracks real changes. Google ignores it on
  // sites that stamp every URL with the build time, which is what this did
  // before, so each entry carries the timestamp of the data it is built from
  // and the evergreen pages carry none at all.
  const marketAt = asDate(market.updatedAt);
  const briefAt = asDate(briefs[0]?.updated_at);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: latest(marketAt, briefAt), changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/brief`, lastModified: briefAt, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/stocks`, lastModified: marketAt, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/market-map`, lastModified: marketAt, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/picks`, lastModified: marketAt, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/track-record`, lastModified: marketAt, changeFrequency: "daily", priority: 0.8 },
    {
      url: `${SITE_URL}/guides`,
      lastModified: asDate(guides[0]?.updated),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    { url: `${SITE_URL}/calculators`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms-of-service`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const sectorRoutes: MetadataRoute.Sitemap = PICK_SECTORS.map((sector) => ({
    url: `${SITE_URL}/picks/${sector.slug}`,
    lastModified: marketAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const stockRoutes: MetadataRoute.Sitemap = symbols.map((row) => ({
    url: `${SITE_URL}/stock/${row.symbol}`,
    lastModified: asDate(row.quote_at) ?? marketAt,
    changeFrequency: "daily",
    priority: row.is_kmi ? 0.7 : 0.6,
  }));

  // Each edition has its own URL; a date with only a morning brief lists
  // just that one, which is also where /brief/<date> canonicalises to.
  const briefRoutes: MetadataRoute.Sitemap = briefs.map((brief) => ({
    url: `${SITE_URL}${briefPath(brief)}`,
    lastModified: asDate(brief.updated_at) ?? new Date(brief.brief_date),
    changeFrequency: "never",
    priority: brief.session === "morning" ? 0.5 : 0.6,
  }));

  const guideRoutes: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: `${SITE_URL}/guides/${guide.slug}`,
    lastModified: asDate(guide.updated),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...sectorRoutes, ...guideRoutes, ...stockRoutes, ...briefRoutes];
}
