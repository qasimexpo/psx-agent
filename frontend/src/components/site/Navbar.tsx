"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { IMAGES } from "@/lib/images";

const LINKS = [
  { href: "/#audit", label: "Portfolio audit" },
  { href: "/picks", label: "Picks" },
  { href: "/brief", label: "Daily brief" },
  { href: "/stocks", label: "Stocks" },
  { href: "/track-record", label: "Track record" },
  { href: "/guides", label: "Guides" },
];

export default function Navbar() {
  // The menu closes when a link is tapped rather than by watching the route,
  // which avoids a state update during render on every navigation.
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-navy-800 bg-navy-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 focus-ring rounded-lg">
          <Image
            src={IMAGES.logo}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg object-cover"
          />
          <span className="text-lg font-bold tracking-tight">SmartSarmaya</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-slate-300 transition hover:text-emerald-400 focus-ring rounded"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/#audit"
            className="hidden rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 focus-ring sm:inline-flex"
          >
            Free audit
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg p-2 text-slate-200 transition hover:bg-white/10 focus-ring lg:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-navy-800 bg-navy-900 px-4 pb-4 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-emerald-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
