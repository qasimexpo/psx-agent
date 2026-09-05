import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PortfolioResult } from "./clientApi";

/** Branded PDF of a portfolio audit, generated in the browser. */

async function getLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch("/images/logo.jpg");
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const NAVY: [number, number, number] = [11, 19, 43];
const EMERALD: [number, number, number] = [16, 185, 129];

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function signed(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}Rs ${Math.abs(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

function wrap(pdf: jsPDF, text: string, width: number): string[] {
  return pdf.splitTextToSize(text, width) as string[];
}

export async function exportAuditToPdf(
  data: PortfolioResult,
  filename = "smartsarmaya-portfolio-audit.pdf",
): Promise<void> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Header band
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, pageWidth, 26, "F");

  const logo = await getLogoDataUrl();
  if (logo) {
    try {
      pdf.addImage(logo, "JPEG", margin, 6, 13, 13);
    } catch {
      // A missing or unreadable logo should never block the export.
    }
  }

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("SmartSarmaya", logo ? margin + 17 : margin, 13);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(190, 200, 220);
  pdf.text("Portfolio audit", logo ? margin + 17 : margin, 19);
  pdf.text(data.report_date, pageWidth - margin, 19, { align: "right" });

  let y = 36;
  pdf.setTextColor(30, 41, 59);

  // Summary tiles
  const tiles: [string, string][] = [
    ["Market value", `Rs ${money(data.totals.market_value)}`],
    ["Unrealised P/L", signed(data.totals.pl_pkr)],
    ["Shariah compliant", `${data.totals.halal_pct}%`],
    ["Largest sector", `${data.totals.top_sector_pct}%`],
  ];
  const tileWidth = contentWidth / 4;
  tiles.forEach(([label, value], index) => {
    const x = margin + index * tileWidth;
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(x, y, tileWidth - 3, 17, 2, 2);
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label.toUpperCase(), x + 3, y + 6);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...NAVY);
    pdf.text(value, x + 3, y + 13);
    pdf.setFont("helvetica", "normal");
  });
  y += 25;

  // Narrative
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  for (const paragraph of [data.verdict, data.risk_summary, data.shariah_note]) {
    if (!paragraph) continue;
    const lines = wrap(pdf, paragraph, contentWidth);
    pdf.text(lines, margin, y);
    y += lines.length * 5 + 3;
  }

  if (data.next_steps.length) {
    y += 2;
    pdf.setFont("helvetica", "bold");
    pdf.text("Suggested next steps", margin, y);
    pdf.setFont("helvetica", "normal");
    y += 6;
    for (const step of data.next_steps) {
      const lines = wrap(pdf, `- ${step}`, contentWidth - 4);
      pdf.text(lines, margin + 2, y);
      y += lines.length * 5 + 1;
    }
    y += 3;
  }

  autoTable(pdf, {
    startY: y,
    head: [["Symbol", "Qty", "Cost", "Live", "P/L", "Weight", "Halal", "Call"]],
    body: data.holdings.map((holding) => [
      holding.symbol,
      String(holding.quantity),
      money(holding.buy_price),
      money(holding.live_price),
      signed(holding.pl_pkr),
      `${holding.weight_pct}%`,
      holding.is_kmi ? "Yes" : "No",
      holding.action,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
  });

  const afterTable =
    (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  let footerY = afterTable + 8;

  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  const reasoning = data.holdings
    .filter((holding) => holding.reason)
    .map((holding) => `${holding.symbol}: ${holding.reason}`);

  for (const line of reasoning) {
    const lines = wrap(pdf, line, contentWidth);
    if (footerY + lines.length * 4 > 270) {
      pdf.addPage();
      footerY = 20;
    }
    pdf.text(lines, margin, footerY);
    footerY += lines.length * 4 + 1;
  }

  if (footerY > 262) {
    pdf.addPage();
    footerY = 20;
  }

  pdf.setDrawColor(...EMERALD);
  pdf.line(margin, footerY + 2, pageWidth - margin, footerY + 2);
  pdf.setFontSize(7);
  pdf.setTextColor(120, 130, 150);
  const disclaimer = wrap(
    pdf,
    "Educational analysis only. Not financial advice and not a religious ruling. Shariah status reflects membership of the KMI All Shares Islamic Index published by the Pakistan Stock Exchange. Market data may be delayed. SmartSarmaya does not store your holdings. smartsarmaya.com",
    contentWidth,
  );
  pdf.text(disclaimer, margin, footerY + 7);

  pdf.save(filename);
}
