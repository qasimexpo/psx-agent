"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchSymbols, type SymbolSuggestion } from "@/lib/api";

type SymbolAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeSymbols?: string[];
  className?: string;
};

export default function SymbolAutocomplete({
  value,
  onChange,
  placeholder = "OGDC",
  disabled = false,
  excludeSymbols = [],
  className = "",
}: SymbolAutocompleteProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const excludeSymbolsKey = useMemo(
    () => excludeSymbols.map((s) => s.toUpperCase()).sort().join("|"),
    [excludeSymbols],
  );

  useEffect(() => {
    const query = value.trim();
    if (dismissed || query.length < 1) {
      setSuggestions((prev) => (prev.length > 0 ? [] : prev));
      setOpen((prev) => (prev ? false : prev));
      setActiveIndex((prev) => (prev !== -1 ? -1 : prev));
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchSymbols(query);
        if (requestId !== requestIdRef.current) return;

        const excluded = new Set(excludeSymbolsKey.split("|").filter(Boolean));
        const filtered = results.filter((item) => !excluded.has(item.symbol));
        setSuggestions(filtered);
        setOpen(filtered.length > 0);
        setActiveIndex(-1);
      } catch {
        if (requestId === requestIdRef.current) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [value, excludeSymbolsKey, dismissed]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setDismissed(true);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (nextValue: string) => {
    setDismissed(false);
    onChange(nextValue.toUpperCase());
  };

  const selectSuggestion = (item: SymbolSuggestion) => {
    requestIdRef.current += 1;
    setDismissed(true);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setLoading(false);
    onChange(item.symbol);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setDismissed(true);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (!dismissed && suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        suppressHydrationWarning
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={
          className ||
          "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[#0B132B] uppercase outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        }
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((item, index) => (
            <li key={item.symbol} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(item)}
                className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-emerald-50 ${
                  index === activeIndex ? "bg-emerald-50" : ""
                }`}
              >
                <span className="shrink-0 font-bold text-[#0B132B]">{item.symbol}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-700">{item.name}</span>
                  <span className="block truncate text-xs text-slate-400">{item.sector}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {loading && value.trim().length > 0 && !dismissed && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          ...
        </span>
      )}
    </div>
  );
}
