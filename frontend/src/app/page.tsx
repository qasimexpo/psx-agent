import Footer from "@/components/Footer";
import GoogleAd from "@/components/GoogleAd";
import HomePage from "@/components/HomePage";
import Navbar from "@/components/Navbar";

export default function Page() {
  const bottomSlot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM;

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <div className="border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-900 sm:px-6 sm:text-sm">
        High Market Volatility: Run a free AI audit on your portfolio before making your
        next trade.
      </div>
      <Navbar />
      <main className="flex-1">
        <HomePage />
      </main>
      <div className="px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <GoogleAd slot={bottomSlot} />
        </div>
      </div>
      <Footer />
    </div>
  );
}
