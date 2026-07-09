import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Privacy Policy — SmartSarmaya",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-navy-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: July 2026</p>

        <div className="prose prose-slate mt-8 space-y-6 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-navy-900">Overview</h2>
            <p>
              SmartSarmaya provides AI-generated portfolio analysis for the Pakistan
              Stock Exchange. We are committed to protecting your privacy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Data Collection</h2>
            <p>
              Portfolio data you enter (stock symbols, buy prices, quantities) is sent
              directly to our analysis server to generate your report. We do not
              permanently store your portfolio information on our servers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Third-Party Services</h2>
            <p>
              This site may display advertisements through Google AdSense. Google may
              use cookies and similar technologies to serve ads. Please refer to
              Google&apos;s privacy policy for details on how they handle data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Analytics</h2>
            <p>
              We may use analytics tools in the future to understand site usage.
              Any analytics implementation will be disclosed in an updated version of
              this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-navy-900">Contact</h2>
            <p>
              For privacy-related questions, please contact us through the site
              operator.
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
