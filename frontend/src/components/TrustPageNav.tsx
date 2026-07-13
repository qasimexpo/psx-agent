import Link from "next/link";

export type TrustPageId = "about" | "privacy" | "terms";

const PAGES: { id: TrustPageId; label: string; href: string }[] = [
  { id: "about", label: "About", href: "/about" },
  { id: "privacy", label: "Privacy Policy", href: "/privacy-policy" },
  { id: "terms", label: "Terms of Service", href: "/terms-of-service" },
];

type TrustPageNavProps = {
  activePage: TrustPageId;
};

export default function TrustPageNav({ activePage }: TrustPageNavProps) {
  return (
    <nav className="flex flex-wrap justify-center gap-2">
      {PAGES.map((page) => {
        const isActive = page.id === activePage;
        return (
          <Link
            key={page.id}
            href={page.href}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
            }`}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
