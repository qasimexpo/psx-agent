import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Terms of Service — SmartSarmaya",
};

export default function TermsOfServicePage() {
  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-navy-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: July 2026</p>

        <div className="prose prose-slate mt-8 space-y-6 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-navy-900">Acceptance of Terms</h2>
            <p>
              By accessing or using SmartSarmaya, you agree to be bound by these Terms of
              Service. If you do not accept these terms, you must discontinue use of the
              platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Financial Disclaimer</h2>
            <p>
              SmartSarmaya is an AI-powered informational tool and is provided for educational
              use only. SmartSarmaya is not a licensed broker, dealer, portfolio manager, or
              financial advisor, and does not provide personalized investment advice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Algorithmic Estimates Only</h2>
            <p>
              Any AI-generated outputs, including buy or sell targets, risk signals, and
              scenario projections, are algorithmic estimates based on available market inputs.
              They are not guarantees of future performance or execution outcomes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Data Timeliness and Sources</h2>
            <p>
              Market data is sourced from third-party providers including TradingView and PSX
              feeds. Data may be delayed, incomplete, or temporarily unavailable, including
              delays of 15 minutes or more. Users are responsible for independently verifying
              prices before placing trades.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">User Responsibility</h2>
            <p>
              You are solely responsible for your investment decisions, trade execution, risk
              management, and regulatory compliance. Use of SmartSarmaya does not create an
              advisor-client, fiduciary, or brokerage relationship.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, SmartSarmaya and its operators bear no
              liability for direct or indirect financial losses, missed opportunities, or
              damages arising from use of the platform, reliance on AI outputs, or third-party
              data interruptions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Changes to Terms</h2>
            <p>
              We may revise these terms from time to time. Continued use of SmartSarmaya after
              updates are posted constitutes acceptance of the revised Terms of Service.
            </p>
          </section>
        </div>

        <Link
          href="/"
          className="mt-10 inline-block text-emerald-600 transition hover:text-emerald-700"
        >
          &larr; Back to Home
        </Link>
      </main>
      <Footer />
    </div>
  );
}
