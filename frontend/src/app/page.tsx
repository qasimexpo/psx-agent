import Footer from "@/components/Footer";
import GoogleAd from "@/components/GoogleAd";
import HomePage from "@/components/HomePage";
import Navbar from "@/components/Navbar";

export default function Page() {
  const topSlot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP;
  const bottomSlot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM;

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <Navbar />
      <div className="px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <GoogleAd slot={topSlot} className="min-h-[90px]" />
        </div>
      </div>
      <main className="flex-1">
        <HomePage />
      </main>
      <div className="px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <GoogleAd slot={bottomSlot} className="min-h-[90px]" />
        </div>
      </div>
      <Footer />
    </div>
  );
}
