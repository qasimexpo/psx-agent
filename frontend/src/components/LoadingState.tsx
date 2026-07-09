import { Loader2 } from "lucide-react";

export default function LoadingState() {
  return (
    <section className="px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="glass-card rounded-2xl p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
            <p className="text-lg font-semibold text-navy-950">
              AI is analyzing market data...
            </p>
            <p className="text-sm text-slate-500">
              Fetching live PSX prices, fundamentals, and generating your report
            </p>
          </div>
          <div className="mt-8 space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
          </div>
        </div>
      </div>
    </section>
  );
}
