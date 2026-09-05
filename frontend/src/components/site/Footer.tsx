import Image from "next/image";
import Link from "next/link";
import { IMAGES } from "@/lib/images";
import { SOCIAL_LINKS } from "@/lib/site";

const COLUMNS = [
  {
    title: "Tools",
    links: [
      { href: "/#audit", label: "Portfolio audit" },
      { href: "/#analyzer", label: "Stock analyser" },
      { href: "/picks", label: "Top halal picks" },
      { href: "/calculators", label: "Calculators" },
    ],
  },
  {
    title: "Market",
    links: [
      { href: "/brief", label: "Daily AI brief" },
      { href: "/stocks", label: "Stock directory" },
      { href: "/#events", label: "Dividends and events" },
      { href: "/track-record", label: "Pick track record" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/privacy-policy", label: "Privacy policy" },
      { href: "/terms-of-service", label: "Terms of service" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-navy-800 bg-navy-900 text-slate-300">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5">
              <Image
                src={IMAGES.logo}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-lg object-cover"
              />
              <span className="text-lg font-bold text-white">SmartSarmaya</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              AI research for the Pakistan Stock Exchange. Free, no account needed, and every
              Shariah label comes from the exchange&apos;s own Islamic index.
            </p>
            {SOCIAL_LINKS.length ? (
              <ul className="mt-4 flex flex-wrap gap-3">
                {SOCIAL_LINKS.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="me noopener noreferrer"
                      className="rounded-lg border border-navy-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-emerald-500 hover:text-emerald-400"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {column.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 transition hover:text-emerald-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-navy-800 pt-6">
          <p className="text-xs leading-relaxed text-slate-400">
            <strong className="text-slate-300">Not financial advice.</strong> SmartSarmaya is an
            educational research tool. Nothing here is a recommendation to buy or sell, and nothing
            here is a religious ruling. Shariah status reflects membership of the KMI All Shares
            Islamic Index published by the Pakistan Stock Exchange. Market data comes from the PSX
            Data Portal and may be delayed. Always consult a licensed adviser and do your own
            research before investing.
          </p>
          <p className="mt-4 text-xs text-slate-500">
            &copy; {new Date().getFullYear()} SmartSarmaya. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
