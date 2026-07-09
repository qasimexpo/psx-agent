import BannerAd from "@/components/BannerAd";
import Footer from "@/components/Footer";
import HomePage from "@/components/HomePage";
import Navbar from "@/components/Navbar";
import { IMAGES } from "@/lib/images";

export default function Page() {
  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <Navbar />
      <div className="px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <BannerAd src={IMAGES.bannerTop} alt="Top advertisement banner" />
        </div>
      </div>
      <main className="flex-1">
        <HomePage />
      </main>
      <div className="px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <BannerAd src={IMAGES.bannerBottom} alt="Bottom advertisement banner" />
        </div>
      </div>
      <Footer />
    </div>
  );
}
