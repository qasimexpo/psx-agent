"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page error]", error);
  }, [error]);

  return (
    <div className="px-4 py-20 sm:px-6">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-navy-900">Something went wrong</h1>
        <p className="mt-2 leading-relaxed text-slate-600">
          This section could not load. Market data is served from the last successful pipeline run,
          so trying again usually works.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-emerald-300"
          >
            Go to the home page
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-4 text-xs text-slate-400">Reference: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
