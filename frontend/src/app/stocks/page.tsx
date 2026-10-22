import type { Metadata } from "next";
import PriceSyncStatus from "@/components/portfolio/PriceSyncStatus";
import StockDirectory from "@/components/stocks/StockDirectory";
import { getLastPriceSync, listIndexableSymbols } from "@/lib/db";
import { Disclaimer, EmptyState, SectionHeading } from "@/components/ui/Primitives";

// Rebuilt when the pipeline writes new data (POST /api/revalidate), which only
// happens around PSX trading hours, so nothing rebuilds overnight or at weekends.
// The day-long interval is only a safety net for a missed refresh call.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "PSX stock directory with Shariah status",
  description:
    "Every KSE-100 and Shariah-compliant stock on the Pakistan Stock Exchange, with live prices and KMI All Shares Islamic Index status. Search and browse by sector.",
  alternates: { canonical: "/stocks" },
};

export default async function StocksPage() {
  const [rows, lastSync] = await Promise.all([listIndexableSymbols(400), getLastPriceSync()]);
  const halalCount = rows.filter((row) => row.is_kmi).length;

  return (
    <div className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          as="h1"
          eyebrow={`${rows.length} companies, ${halalCount} Shariah compliant`}
          title="PSX stock directory"
          description="Live prices for the KSE-100 and every Shariah-compliant listing, grouped by sector. Each company has its own page with technicals, corporate actions and Islamic index status."
        />

        <div className="mb-6">
          <PriceSyncStatus syncedAt={lastSync} />
        </div>

        {rows.length ? (
          <StockDirectory rows={rows} />
        ) : (
          <EmptyState
            title="No stocks loaded yet"
            description="Run the market job once and the directory will fill with live prices from the exchange."
          />
        )}

        <Disclaimer className="mt-10" />
      </div>
    </div>
  );
}
