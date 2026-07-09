import Link from "next/link";
import { IMAGES } from "@/lib/images";

export default function Footer() {
  return (
    <footer className="nav-dark mt-auto border-t border-[#1e293b] bg-[#0B132B] px-4 py-10 text-slate-300 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img
                src={IMAGES.logo}
                alt="SmartSarmaya"
                className="h-9 w-9 rounded-lg object-cover"
              />
              <p className="text-lg font-bold text-white">SmartSarmaya</p>
            </div>
            <p className="mt-3 max-w-md text-sm text-slate-400">
              This is an AI tool, not financial advice. Always consult a licensed
              financial advisor before making investment decisions.
            </p>
          </div>

          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/privacy" className="text-slate-300 transition hover:text-emerald-400">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-slate-300 transition hover:text-emerald-400">
              Terms of Service
            </Link>
          </nav>
        </div>

        <p className="mt-8 border-t border-[#1e293b] pt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} SmartSarmaya.com. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
