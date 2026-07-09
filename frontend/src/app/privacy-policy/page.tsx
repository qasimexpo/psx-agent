import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Privacy Policy — SmartSarmaya",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-navy-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: July 2026</p>

        <div className="prose prose-slate mt-8 space-y-6 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-navy-900">Stateless by Design</h2>
            <p>
              SmartSarmaya is a stateless application built for runtime analysis. We do not
              require account registration and we do not store user identity profiles,
              authentication credentials, or persistent portfolio records.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Data We Process</h2>
            <p>
              When you submit portfolio inputs such as symbols, quantities, and buy prices,
              that information is processed in memory to generate AI insights. This processing
              is session-based and intended solely to return your requested report.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">No Permanent Portfolio Storage</h2>
            <p>
              Submitted portfolio data is discarded after analysis is completed. SmartSarmaya
              does not maintain a personal portfolio database, login history, or investor
              identity ledger for end users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Third-Party Services</h2>
            <p>
              We rely on third-party market data and infrastructure providers to operate the
              platform. These providers may apply their own policies for service reliability,
              request handling, and telemetry. We recommend reviewing their privacy terms
              independently.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Security Practices</h2>
            <p>
              We use reasonable technical and operational safeguards to protect service traffic.
              However, no internet-based system is completely risk-free, and users should avoid
              submitting sensitive personal or account credentials to any analysis tool.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Policy Updates</h2>
            <p>
              We may update this Privacy Policy to reflect legal, technical, or product changes.
              Updates become effective upon publication on this page, with the latest revision
              date shown above.
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
