import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { IMAGES } from "@/lib/images";

type TrustPageHeroProps = {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
};

export default function TrustPageHero({
  title,
  subtitle,
  icon: Icon,
}: TrustPageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-[#0B132B] px-4 py-12 text-white sm:px-6 sm:py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.15),_transparent_55%)]" />

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-5 flex justify-center">
          <Image
            src={IMAGES.logo}
            alt="SmartSarmaya"
            width={64}
            height={64}
            className="h-14 w-14 rounded-2xl object-cover shadow-lg shadow-emerald-500/20 sm:h-16 sm:w-16"
            priority
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
              <Icon className="h-5 w-5 text-emerald-400" />
            </span>
          )}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        </div>

        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-300 sm:text-lg">
          {subtitle}
        </p>

        <span className="mt-5 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
          Last updated: July 2026
        </span>
      </div>
    </section>
  );
}
