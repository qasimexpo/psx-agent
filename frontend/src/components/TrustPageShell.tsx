import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import TrustHighlightGrid, { type TrustHighlight } from "@/components/TrustHighlightGrid";
import TrustPageHero from "@/components/TrustPageHero";
import TrustPageNav, { type TrustPageId } from "@/components/TrustPageNav";
import TrustSectionCard, { type TrustSection } from "@/components/TrustSectionCard";

type TrustPageShellProps = {
  activePage: TrustPageId;
  title: string;
  subtitle: string;
  heroIcon?: LucideIcon;
  highlights: TrustHighlight[];
  sections: TrustSection[];
  topCallout?: {
    icon: LucideIcon;
    text: ReactNode;
    variant?: "default" | "warning";
  };
};

export default function TrustPageShell({
  activePage,
  title,
  subtitle,
  heroIcon,
  highlights,
  sections,
  topCallout,
}: TrustPageShellProps) {
  const CalloutIcon = topCallout?.icon;

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <Navbar />
      <TrustPageHero title={title} subtitle={subtitle} icon={heroIcon} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <TrustPageNav activePage={activePage} />

        <div className="mt-8">
          <TrustHighlightGrid highlights={highlights} />
        </div>

        {topCallout && CalloutIcon && (
          <div
            className={`mt-8 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 ${
              topCallout.variant === "warning"
                ? "border border-amber-400/40 bg-amber-50"
                : "trust-banner"
            }`}
          >
            <div className="flex items-start gap-3">
              <CalloutIcon
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  topCallout.variant === "warning" ? "text-amber-600" : "text-emerald-400"
                }`}
              />
              <p
                className={`text-sm leading-relaxed sm:text-base ${
                  topCallout.variant === "warning"
                    ? "text-amber-900"
                    : "text-emerald-900"
                }`}
              >
                {topCallout.text}
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-4">
          {sections.map((section) => (
            <TrustSectionCard key={section.title} section={section} />
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="glow-button inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            &larr; Back to Home
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
