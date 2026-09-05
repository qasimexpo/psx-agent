import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck, Zap } from "lucide-react";
import type { Scorecard } from "@/lib/db";

/**
 * The hero leads with the one thing no other PSX site offers: AI picks screened
 * against the exchange's own Islamic index, with a published track record.
 */
export default function Hero({
  scorecard,
  halalCount,
}: {
  scorecard: Scorecard;
  halalCount: number;
}) {
  const hasRecord = scorecard.total >= 10;

  return (
    <section className="panel-dark relative overflow-hidden px-4 py-14 sm:px-6 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(16,185,129,0.18), transparent 45%), radial-gradient(circle at 85% 15%, rgba(45,102,255,0.14), transparent 40%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-5xl text-center">
        <span className="badge badge-on-dark mx-auto mb-5">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          Screened against the KMI All Shares Islamic Index
        </span>

        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
          Halal stock research for the
          <span className="text-emerald-400"> Pakistan Stock Exchange</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
          Audit your portfolio, analyse any listed company, and read AI picks whose Shariah status
          comes from the exchange itself, not from a chatbot&apos;s guess. Free, and no account.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="#audit"
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-600 sm:w-auto"
          >
            <Zap className="h-4 w-4" aria-hidden />
            Audit my portfolio
          </Link>
          <Link
            href="#picks"
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10 sm:w-auto"
          >
            See today&apos;s halal picks
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <dl className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Halal stocks</dt>
            <dd className="tabular mt-0.5 text-xl font-bold text-white">{halalCount || "—"}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Picks tracked</dt>
            <dd className="tabular mt-0.5 text-xl font-bold text-white">
              {scorecard.total || "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">In profit</dt>
            <dd className="tabular mt-0.5 text-xl font-bold text-emerald-400">
              {hasRecord ? `${scorecard.hit_rate}%` : "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">Your data kept</dt>
            <dd className="mt-0.5 text-xl font-bold text-white">None</dd>
          </div>
        </dl>

        <p className="mx-auto mt-6 flex max-w-2xl items-center justify-center gap-2 text-sm text-slate-400">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          No login, no registration, no fees. Your holdings are analysed in the request and never
          written to disk.
        </p>
      </div>
    </section>
  );
}
