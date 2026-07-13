import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type TrustSection = {
  icon: LucideIcon;
  title: string;
  content: ReactNode;
  variant?: "default" | "warning";
};

type TrustSectionCardProps = {
  section: TrustSection;
};

export default function TrustSectionCard({ section }: TrustSectionCardProps) {
  const Icon = section.icon;
  const isWarning = section.variant === "warning";

  return (
    <section
      className={`pick-card-premium p-5 sm:p-6 ${
        isWarning ? "trust-section-warning border-t-4" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            isWarning ? "bg-amber-500/10" : "bg-emerald-500/10"
          }`}
        >
          <Icon
            className={`h-5 w-5 ${isWarning ? "text-amber-600" : "text-emerald-600"}`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-navy-900">{section.title}</h2>
          <div className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
            {section.content}
          </div>
        </div>
      </div>
    </section>
  );
}
