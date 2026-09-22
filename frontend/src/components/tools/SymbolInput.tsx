"use client";

import { useEffect, useRef, useState } from "react";
import { searchSymbols, type Suggestion } from "@/lib/clientApi";

/** Symbol field with debounced autocomplete against the covered universe. */
export default function SymbolInput({
  value,
  onChange,
  placeholder = "e.g. OGDC",
  exclude = [],
  id,
}: {
  value: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
  exclude?: string[];
  id?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextLookup = useRef(false);

  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    const term = value.trim();
    // Nothing to look up. The list is hidden by the derived check below rather
    // than by clearing state here, which would update state during an effect.
    if (term.length < 1) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const results = await searchSymbols(term);
      if (cancelled) return;
      setSuggestions(results.filter((item) => !exclude.includes(item.symbol)));
      setHighlight(-1);
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `exclude` is recreated each render by the parent; comparing its contents
    // keeps this from re-firing on every keystroke of a sibling row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, exclude.join(",")]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const choose = (symbol: string) => {
    skipNextLookup.current = true;
    onChange(symbol);
    setOpen(false);
    setSuggestions([]);
  };

  // Derived rather than stored, so a stale list from a previous term can never
  // be shown while the next lookup is still debouncing.
  const term = value.trim().toUpperCase();
  const matches = term
    ? suggestions.filter(
        (item) => item.symbol.includes(term) || item.name.toUpperCase().includes(term),
      )
    : [];
  const visible = open && matches.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delayed so a click on a suggestion still registers before the list
          // unmounts. Without this the open list sits over the next field and
          // swallows the first click.
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(event) => {
          if (!visible) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && highlight >= 0) {
            event.preventDefault();
            choose(matches[highlight].symbol);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase text-navy-900 placeholder:normal-case placeholder:text-slate-400"
      />

      {visible ? (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((item, index) => (
            <li key={item.symbol}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item.symbol)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  index === highlight ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0">
                  <span className="font-semibold text-navy-900">{item.symbol}</span>
                  <span className="ml-2 truncate text-xs text-slate-500">{item.name}</span>
                </span>
                {item.is_kmi ? (
                  <span className="badge badge-halal shrink-0">Compliant</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
