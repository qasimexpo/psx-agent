"use client";

import { Layers } from "lucide-react";
import {
  TOP_PICK_SECTOR_OPTIONS,
  type TopPickSector,
} from "@/lib/topPickSectors";

type SectorSelectorProps = {
  value: TopPickSector;
  onChange: (value: TopPickSector) => void;
  disabled?: boolean;
  className?: string;
};

export default function SectorSelector({
  value,
  onChange,
  disabled = false,
  className = "",
}: SectorSelectorProps) {
  return (
    <div className={`min-w-[160px] sm:min-w-[200px] ${className}`}>
      <label
        htmlFor="top-pick-sector"
        className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs"
      >
        <Layers className="h-3.5 w-3.5 text-emerald-400" />
        Sector
      </label>
      <div className="relative">
        <select
          id="top-pick-sector"
          value={value}
          onChange={(event) => onChange(event.target.value as TopPickSector)}
          disabled={disabled}
          className="w-full appearance-none rounded-full border border-white/20 border-l-4 border-l-emerald-500 bg-white/10 py-2 pl-3 pr-9 text-sm font-semibold text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {TOP_PICK_SECTOR_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-[#0B132B] text-white"
            >
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
          ▾
        </span>
      </div>
    </div>
  );
}
