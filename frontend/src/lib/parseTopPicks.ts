import type { PickCard, PickHorizon } from "@/lib/api";

const HORIZON_PATTERNS: Record<PickHorizon, RegExp> = {
  daily: /daily/i,
  monthly: /monthly/i,
  yearly: /yearly|annual/i,
};

export function parsePicksFromHtml(html: string, horizon: PickHorizon): PickCard[] {
  if (typeof window === "undefined") {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3"));
  const pattern = HORIZON_PATTERNS[horizon];
  const sectionHeading = headings.find((h) => pattern.test(h.textContent ?? ""));
  if (!sectionHeading) {
    return [];
  }

  let table: HTMLTableElement | null = null;
  let node: Element | null = sectionHeading.nextElementSibling;
  while (node) {
    if (node.tagName === "TABLE") {
      table = node as HTMLTableElement;
      break;
    }
    if (node.tagName.match(/^H[1-3]$/)) {
      break;
    }
    node = node.nextElementSibling;
  }

  if (!table) {
    return [];
  }

  const rows = Array.from(table.querySelectorAll("tr")).slice(1);
  const picks: PickCard[] = [];

  for (const row of rows.slice(0, 5)) {
    const cells = Array.from(row.querySelectorAll("td, th")).map(
      (cell) => cell.textContent?.trim() ?? "",
    );
    if (cells.length < 2) {
      continue;
    }
    picks.push({
      symbol: cells[0] || "N/A",
      sector: "PSX",
      summary: cells[1] || "",
      why: cells[1] || "",
      outlook_short: cells[3] || "See full report",
      outlook_long: cells[3] || "See full report",
      buy_zone: cells[2] || "N/A",
      current_price: cells[2] || "N/A",
      exit_target: cells[3] || "N/A",
    });
  }

  return picks;
}
