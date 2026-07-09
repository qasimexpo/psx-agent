import Image from "next/image";
import { Lock, Shield } from "lucide-react";
import { IMAGES } from "@/lib/images";

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-4 py-14 text-white sm:px-6 sm:py-20">
      <Image
        src={IMAGES.bannerTop}
        alt=""
        fill
        className="object-cover"
        priority
        aria-hidden
      />
      <div className="absolute inset-0 bg-[#0B132B]/85" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.15),_transparent_55%)]" />

      <div className="relative mx-auto max-w-6xl text-center">
        <div className="mb-6 flex justify-center">
          <Image
            src={IMAGES.logo}
            alt="SmartSarmaya"
            width={72}
            height={72}
            className="h-16 w-16 rounded-2xl object-cover shadow-lg shadow-emerald-500/20 sm:h-18 sm:w-18"
            priority
          />
        </div>

        <h1 className="text-3xl font-bold tracking-wide sm:text-5xl sm:leading-tight">
          SmartSarmaya - AI PSX Portfolio Auditor
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">
          Get institutional-grade stock analysis in seconds.
        </p>

        <div className="trust-banner mx-auto mt-8 max-w-3xl rounded-2xl px-5 py-4 text-left backdrop-blur-sm sm:px-6 sm:py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex shrink-0 gap-1">
              <Shield className="h-5 w-5 text-emerald-400" />
              <Lock className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-sm leading-relaxed text-emerald-100 sm:text-base">
              <strong className="text-white">100% Free &amp; Anonymous.</strong> No Login.
              No Registration. No Hidden Fees. We DO NOT store your financial data.
              Your portfolio is analyzed at runtime and instantly deleted.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
