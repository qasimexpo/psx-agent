import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalyzeResult } from "./api";

async function getLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch("/images/logo.jpg");
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatPrice(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPl(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}Rs. ${Math.abs(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

export async function exportReportToPdf(
  data: AnalyzeResult,
  filename?: string,
): Promise<void> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const logoDataUrl = await getLogoDataUrl();

  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, "JPEG", margin, 12, 10, 10);
  }

  pdf.setFontSize(18);
  pdf.setTextColor(11, 19, 43);
  pdf.text("SmartSarmaya", margin + 13, 20);

  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text("AI PSX Portfolio Auditor", margin + 13, 27);
  pdf.text(data.report_date, pageWidth - margin, 27, { align: "right" });

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, 32, pageWidth - margin, 32);

  const tableBody = data.holdings.map((row) => [
    row.symbol,
    row.quantity.toLocaleString(),
    formatPrice(row.buy_price),
    formatPrice(row.live_price),
    formatPl(row.pl_pkr),
    row.rsi !== null ? row.rsi.toFixed(2) : "N/A",
    row.ai_action,
  ]);

  autoTable(pdf, {
    startY: 38,
    head: [["Symbol", "Qty", "Buy Price", "Live Price", "P/L (PKR)", "RSI", "AI Action"]],
    body: tableBody,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [11, 19, 43],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    theme: "grid",
  });

  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY ?? 80;

  pdf.setFontSize(11);
  pdf.setTextColor(11, 19, 43);
  pdf.text("AI Risk Analysis Summary", margin, finalY + 12);

  pdf.setFontSize(9);
  pdf.setTextColor(51, 65, 85);
  const riskLines = pdf.splitTextToSize(data.risk_summary, pageWidth - margin * 2);
  pdf.text(riskLines, margin, finalY + 20);

  const footerY = pdf.internal.pageSize.getHeight() - 10;
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);
  pdf.text("SmartSarmaya.com | AI PSX Portfolio Auditor", pageWidth / 2, footerY, {
    align: "center",
  });

  const date = new Date().toISOString().slice(0, 10);
  pdf.save(filename ?? `SmartSarmaya-Report-${date}.pdf`);
}
