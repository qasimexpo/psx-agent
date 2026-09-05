import type { Metadata } from "next";
import Link from "next/link";
import Calculators from "@/components/tools/Calculators";
import { SectionHeading } from "@/components/ui/Primitives";

export const metadata: Metadata = {
  title: "Free PSX calculators for Pakistani investors",
  description:
    "Free PSX calculators for Pakistani investors: capital gains tax for filers and non filers, dividend yield after withholding, and investment compounding.",
  alternates: { canonical: "/calculators" },
};

export default function CalculatorsPage() {
  return (
    <div className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          eyebrow="Free tools"
          title="Calculators for PSX investors"
          description="Three calculators for the numbers that come up most often when you invest on the Pakistan Stock Exchange. They are free, they need no account, and everything is worked out in your browser, so nothing you type here is sent to us or stored anywhere."
        />

        <Calculators />

        <div className="card mt-5 border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 className="text-base font-bold text-amber-900">About the tax rates used here</h2>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            The 15 percent filer and 30 percent non filer rates used above are indicative. Rates and
            rules for capital gains and for withholding on dividends are set by the Finance Act and
            change from time to time, and some categories of security and some holding periods are
            treated differently. Confirm the current rates with the Federal Board of Revenue or your
            tax adviser before relying on any figure here, and check what your broker actually
            deducted on your statement. These calculators are educational and are not tax advice.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">Notes on the maths</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>
              Capital gains tax is applied to the realised gain only. If the sale is at a loss, the
              tax shown is zero, and no allowance is made for setting that loss against other gains.
            </li>
            <li>
              Dividend withholding is applied to the gross dividend at source, so the net figure is
              what would reach your account. Yield is calculated on the share price you entered.
            </li>
            <li>
              The growth calculator compounds monthly and assumes each contribution is made at the
              end of the month. It is a projection, not a forecast.
            </li>
            <li>
              None of the three includes brokerage commission, CDC charges, the sales tax on
              commission, or inflation. Real outcomes will be lower than the headline numbers.
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/stocks"
              className="focus-ring rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Look up a PSX stock
            </Link>
            <Link
              href="/about"
              className="focus-ring rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-slate-400 hover:bg-slate-50"
            >
              How this site works
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-slate-500">
          These calculators are educational tools. They are not financial advice, not tax advice and
          not a religious ruling. Figures are indicative only, and you should confirm current
          Federal Board of Revenue rates and your own broker&apos;s charges before acting on them.
        </p>
      </div>
    </div>
  );
}
