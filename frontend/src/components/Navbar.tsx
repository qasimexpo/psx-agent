import Image from "next/image";
import Link from "next/link";
import { IMAGES } from "@/lib/images";

export default function Navbar() {
  return (
    <header className="nav-dark sticky top-0 z-50 border-b border-[#1e293b] bg-[#0B132B] text-white shadow-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 transition hover:opacity-90"
        >
          <Image
            src={IMAGES.logo}
            alt="SmartSarmaya"
            width={40}
            height={40}
            className="h-10 w-10 rounded-lg object-cover"
            priority
          />
          <span className="text-lg font-bold tracking-tight text-white sm:text-xl">
            SmartSarmaya
          </span>
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium sm:gap-6">
          <a
            href="#analyze"
            className="text-slate-300 transition hover:text-emerald-400"
          >
            Analyze
          </a>
          <a
            href="#top-picks"
            className="text-slate-300 transition hover:text-emerald-400"
          >
            Top Picks
          </a>
          <a
            href="#news"
            className="text-slate-300 transition hover:text-emerald-400"
          >
            News
          </a>
        </nav>
      </div>
    </header>
  );
}
