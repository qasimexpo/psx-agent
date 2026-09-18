import Link from "next/link";
import type { ReactNode } from "react";
import { changeClass, percent } from "@/lib/format";

/** Small shared building blocks used across every section. */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  as: Heading = "h2",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Pass "h1" when this heading opens the page rather than a section of it. */
  as?: "h1" | "h2";
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <Heading className="section-title">{title}</Heading>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function HalalBadge({ verified = true }: { verified?: boolean }) {
  if (!verified) {
    return <span className="badge badge-neutral">Not KMI listed</span>;
  }
  return (
    <span className="badge badge-halal" title="Constituent of the KMI All Shares Islamic Index, per the Pakistan Stock Exchange">
      Shariah verified
    </span>
  );
}

export function ChangePill({ value, className = "" }: { value: number | null; className?: string }) {
  const tone =
    value === null || value === 0
      ? "bg-slate-100 text-slate-600"
      : value > 0
        ? "bg-emerald-50 text-emerald-700"
        : "bg-rose-50 text-rose-700";
  return (
    <span className={`badge tabular ${tone} ${className}`}>{percent(value)}</span>
  );
}

export function Change({ value }: { value: number | null }) {
  return <span className={`tabular font-semibold ${changeClass(value)}`}>{percent(value)}</span>;
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const valueTone =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : "text-navy-900";
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`tabular mt-1 text-xl font-bold sm:text-2xl ${valueTone}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="text-slate-400">{icon}</div> : null}
      <p className="font-semibold text-navy-900">{title}</p>
      <p className="max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function SymbolLink({
  symbol,
  className = "",
  children,
}: {
  symbol: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={`/stock/${symbol.toUpperCase()}`}
      className={`font-semibold text-navy-900 underline-offset-2 hover:text-emerald-600 hover:underline ${className}`}
    >
      {children ?? symbol.toUpperCase()}
    </Link>
  );
}

/** A compact line chart with no dependencies. */
export function Sparkline({
  values,
  width = 160,
  height = 44,
  className = "",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!values || values.length < 2) return null;

  const padding = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const rising = values[values.length - 1] >= values[0];
  const stroke = rising ? "#34d399" : "#fb7185";
  const areaId = `spark-${rising ? "up" : "down"}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label={rising ? "Trending up" : "Trending down"}
    >
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#${areaId})`}
        points={`${padding},${height - padding} ${points.join(" ")} ${width - padding},${height - padding}`}
      />
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}

/** Where a price sits inside its 52 week range. */
export function RangeBar({
  position,
  low,
  high,
}: {
  position: number | null;
  low: string;
  high: string;
}) {
  if (position === null) return null;
  return (
    <div>
      <div className="relative h-1.5 w-full rounded-full bg-slate-200">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-navy-900 shadow"
          style={{ left: `calc(${position}% - 6px)` }}
        />
      </div>
      <div className="tabular mt-1.5 flex justify-between text-[11px] text-slate-500">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-slate-500 ${className}`}>
      SmartSarmaya is an educational research tool, not a licensed financial adviser and not a
      source of religious rulings. Shariah status reflects membership of the KMI All Shares
      Islamic Index published by the Pakistan Stock Exchange. Always do your own research.
    </p>
  );
}
