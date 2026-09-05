import type { MetadataRoute } from "next";
import { listBriefs, listIndexableSymbols } from "@/lib/db";
import { PICK_SECTORS } from "@/lib/sectors";
import { SITE_URL } from "@/lib/site";

/**
 * The sitemap is generated from the database, so every stock page and every
 * published brief is submitted to search engines automatically as the pipeline
 * creates them.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/brief`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/stocks`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/picks`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/track-record`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/calculators`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms-of-service`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const sectorRoutes: MetadataRoute.Sitemap = PICK_SECTORS.map((sector) => ({
    url: `${SITE_URL}/picks/${sector.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const [symbols, briefs] = await Promise.all([
    listIndexableSymbols(400),
    listBriefs(120),
  ]);

  const stockRoutes: MetadataRoute.Sitemap = symbols.map((row) => ({
    url: `${SITE_URL}/stock/${row.symbol}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: row.is_kmi ? 0.7 : 0.6,
  }));

  const seen = new Set<string>();
  const briefRoutes: MetadataRoute.Sitemap = [];
  for (const brief of briefs) {
    if (seen.has(brief.brief_date)) continue;
    seen.add(brief.brief_date);
    briefRoutes.push({
      url: `${SITE_URL}/brief/${brief.brief_date}`,
      lastModified: new Date(brief.brief_date),
      changeFrequency: "never",
      priority: 0.6,
    });
  }

  return [...staticRoutes, ...sectorRoutes, ...stockRoutes, ...briefRoutes];
}
