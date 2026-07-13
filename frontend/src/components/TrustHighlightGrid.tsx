import type { LucideIcon } from "lucide-react";

export type TrustHighlight = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type TrustHighlightGridProps = {
  highlights: TrustHighlight[];
};

export default function TrustHighlightGrid({ highlights }: TrustHighlightGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {highlights.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.title}
            className="pick-card-premium flex flex-col items-center px-5 py-6 text-center sm:items-start sm:text-left"
          >
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10">
              <Icon className="h-5 w-5 text-emerald-600" />
            </span>
            <h3 className="text-sm font-bold text-navy-900">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {item.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
