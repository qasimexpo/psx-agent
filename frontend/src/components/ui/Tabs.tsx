"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type Tab = { id: string; label: string; count?: number };

/**
 * A row of tabs over server-rendered panels.
 *
 * Every panel is rendered and the inactive ones are hidden, so switching is
 * instant and a half-filled form keeps its text. The choice goes into the
 * URL (?tab=) so a reload, the page's auto-refresh or a shared link opens
 * the same tab; the server reads it too, so the first paint already matches.
 * Arrow keys, Home and End move between tabs, as the ARIA tabs pattern expects.
 */
export default function Tabs({
  tabs,
  panels,
  initial,
  label,
}: {
  tabs: Tab[];
  panels: Record<string, ReactNode>;
  initial: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0].id);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function select(id: string, focus = false) {
    setActive(id);
    router.replace(id === tabs[0].id ? pathname : `${pathname}?tab=${id}`, { scroll: false });
    if (focus) buttons.current[tabs.findIndex((t) => t.id === id)]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === active);
    const next: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (event.key in next) {
      event.preventDefault();
      select(tabs[next[event.key]].id, true);
    }
  }

  return (
    <div>
      <div className="sticky top-[61px] z-30 -mx-4 bg-brand-surface/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="table-scroll flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        >
          {tabs.map((tab, index) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  buttons.current[index] = element;
                }}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(tab.id)}
                className={`focus-ring flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  selected ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-navy-900"
                }`}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span
                    className={`tabular rounded-full px-1.5 text-xs ${selected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active}
          className="mt-4 space-y-6"
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
