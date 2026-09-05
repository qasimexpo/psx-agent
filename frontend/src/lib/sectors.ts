/**
 * Pick sectors and their URL slugs.
 *
 * Each sector gets its own page rather than a query parameter on the home page.
 * That keeps the home page statically rendered and turns every sector into
 * something a search engine can index, which is where "halal cement stocks in
 * Pakistan" style traffic comes from.
 */

export const SECTOR_ALL = "All";

export type SectorMeta = {
  name: string;
  slug: string;
  title: string;
  blurb: string;
};

export const PICK_SECTORS: SectorMeta[] = [
  {
    name: "Banking (Islamic)",
    slug: "islamic-banking",
    title: "Islamic banking stocks",
    blurb:
      "Islamic banks listed on the PSX that pass the exchange's Shariah screen. Conventional banks are excluded automatically because they are not in the Islamic index.",
  },
  {
    name: "Cement",
    slug: "cement",
    title: "Cement stocks",
    blurb:
      "Cement makers are among the most rate-sensitive names on the exchange, and construction demand drives their volumes.",
  },
  {
    name: "Energy (E&P)",
    slug: "energy",
    title: "Energy, oil and gas stocks",
    blurb:
      "Exploration, marketing and refining companies. This is where circular debt news moves prices most.",
  },
  {
    name: "Power Generation",
    slug: "power-generation",
    title: "Power generation stocks",
    blurb:
      "Independent power producers and distributors, usually held for dividend yield rather than growth.",
  },
  {
    name: "Technology",
    slug: "technology",
    title: "Technology stocks",
    blurb:
      "Software and communication companies, the closest thing the PSX has to a growth sector.",
  },
  {
    name: "Fertilizer",
    slug: "fertilizer",
    title: "Fertilizer stocks",
    blurb:
      "Large, liquid and consistently dividend paying. Gas pricing and the agricultural cycle drive earnings.",
  },
  {
    name: "Pharmaceuticals",
    slug: "pharmaceuticals",
    title: "Pharmaceutical stocks",
    blurb:
      "Defensive names whose margins depend on drug pricing policy and the cost of imported inputs.",
  },
  {
    name: "Automobile",
    slug: "automobile",
    title: "Automobile stocks",
    blurb:
      "Assemblers and parts makers. Volumes track financing rates, import policy and the rupee.",
  },
  {
    name: "Textile",
    slug: "textile",
    title: "Textile stocks",
    blurb:
      "Pakistan's largest export sector, sensitive to global demand, cotton prices and energy costs.",
  },
  {
    name: "Food & Personal Care",
    slug: "food-personal-care",
    title: "Food and personal care stocks",
    blurb:
      "Consumer staples with pricing power, usually the steadiest earners in the market.",
  },
];

export const SECTOR_NAMES = PICK_SECTORS.map((sector) => sector.name);

export function sectorBySlug(slug: string): SectorMeta | undefined {
  return PICK_SECTORS.find((sector) => sector.slug === slug);
}

/**
 * PSX sector codes to pick-sector slugs. Mirrors SECTOR_CODE_MAP in
 * pipeline/config.py, and exists so a stock page can link to the sector page
 * that covers it without matching on display names, which differ between the
 * exchange's directory and our own labels.
 */
const SECTOR_CODE_SLUGS: Record<string, string> = {
  "0807": "islamic-banking",
  "0804": "cement",
  "0820": "energy",
  "0821": "energy",
  "0825": "energy",
  "0824": "power-generation",
  "0828": "technology",
  "0809": "fertilizer",
  "0823": "pharmaceuticals",
  "0801": "automobile",
  "0802": "automobile",
  "0829": "textile",
  "0830": "textile",
  "0831": "textile",
  "0810": "food-personal-care",
};

/**
 * The sector page for a stock, or null when it has none. Islamic banking is
 * the exception: the sector page only lists KMI constituents, so a
 * conventional bank must not be linked into it.
 */
export function slugForSectorCode(code: string, isKmi: boolean): string | null {
  const slug = SECTOR_CODE_SLUGS[code] ?? null;
  if (slug === "islamic-banking" && !isKmi) return null;
  return slug;
}

export function slugForSector(name: string): string | null {
  return PICK_SECTORS.find((sector) => sector.name === name)?.slug ?? null;
}
