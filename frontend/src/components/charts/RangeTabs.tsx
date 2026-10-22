"use client";

import { RANGES, type RangeKey } from "@/lib/charts";

/** The 1M / 3M / 6M / 1Y switch, as a segmented control. */
export default function RangeTabs({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Time range">
      {RANGES.map(({ key }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`focus-ring rounded-md px-3 py-1 text-xs font-semibold transition ${
            value === key ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900"
          }`}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
