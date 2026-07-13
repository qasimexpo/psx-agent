"use client";

import { Clock } from "lucide-react";
import {
  TIMEFRAME_OPTIONS,
  type AnalysisTimeframe,
} from "@/lib/timeframes";

type TimeframeSelectorProps = {
  value: AnalysisTimeframe;
  onChange: (value: AnalysisTimeframe) => void;
  disabled?: boolean;
  className?: string;
};

export default function TimeframeSelector({
  value,
  onChange,
  disabled = false,
  className = "",
}: TimeframeSelectorProps) {
  return (
    <div className={`min-w-[200px] ${className}`}>
      <label
        htmlFor="analysis-timeframe"
        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        <Clock className="h-3.5 w-3.5 text-emerald-600" />
        Analysis Timeframe
      </label>
      <div className="relative">
        <select
          id="analysis-timeframe"
          value={value}
          onChange={(event) => onChange(event.target.value as AnalysisTimeframe)}
          disabled={disabled}
          className="w-full appearance-none rounded-xl border border-slate-200 border-l-4 border-l-emerald-500 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-[#0B132B] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {TIMEFRAME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          ▾
        </span>
      </div>
    </div>
  );
}
