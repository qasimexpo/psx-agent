import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="px-4 py-20 sm:px-6">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <Compass className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-navy-900">Page not found</h1>
        <p className="mt-2 leading-relaxed text-slate-600">
          That link does not lead anywhere. If you were looking for a company, it may not be one we
          cover yet.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Go to the home page
          </Link>
          <Link
            href="/stocks"
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-emerald-300"
          >
            Browse all stocks
          </Link>
        </div>
      </div>
    </div>
  );
}
