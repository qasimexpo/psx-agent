import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer, SectionHeading } from "@/components/ui/Primitives";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Contact SmartSarmaya about data corrections, press enquiries, advertising or general questions on our free AI research tools for the Pakistan Stock Exchange.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <SectionHeading
          eyebrow="Get in touch"
          title="Contact"
          description="One email address, read by a person. There is no contact form here because there is no backend to receive one, and we would rather not pretend otherwise."
        />

        <div className="card panel-dark p-6 sm:p-8">
          <p className="eyebrow eyebrow-on-dark">Email</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="focus-ring mt-2 inline-block text-xl font-bold text-white underline-offset-4 hover:text-emerald-300 hover:underline sm:text-2xl"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
            Write in English or Urdu. If you are reporting a problem with a specific stock page,
            please include the ticker symbol and what you expected to see, because that makes it
            far quicker to fix.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">What to write to us about</h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
            <li>
              <strong className="text-navy-900">Corrections to data.</strong> A wrong price, a
              stale 52 week range, a missing dividend or book closure date, a company showing the
              wrong Shariah status against the current KMI All Shares Islamic Index. These are the
              most useful emails we get, and they get fixed first.
            </li>
            <li>
              <strong className="text-navy-900">Press and media.</strong> Questions about the
              method, the data sources or the track record, from journalists and researchers
              covering the Pakistan Stock Exchange.
            </li>
            <li>
              <strong className="text-navy-900">Advertising.</strong> Enquiries about placement on
              the site. Note that we do not accept payment from listed companies, brokers or fund
              managers to feature a stock, and advertising never influences the picks.
            </li>
            <li>
              <strong className="text-navy-900">General questions and feedback.</strong> How
              something is calculated, what a number means, a feature you would find useful, or a
              bug that made a page unusable.
            </li>
            <li>
              <strong className="text-navy-900">Privacy requests.</strong> Anything covered by the{" "}
              <Link
                href="/privacy-policy"
                className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
              >
                privacy policy
              </Link>
              , including deleting an earlier email exchange.
            </li>
          </ul>
        </div>

        <div className="card mt-5 border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 className="text-base font-bold text-amber-900">What we cannot do</h2>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            We cannot give personal investment advice. We are not registered with the SECP as an
            investment adviser, we do not know your finances, and answering a question about what
            you personally should buy would be both unhelpful and improper.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            So we do not reply to requests for stock tips. That includes questions such as which
            share should I buy today, should I sell this holding now, what is your target price for
            my stock, or please review my portfolio and tell me what to do. Those messages are read
            and then left unanswered, which is not rudeness, it is the only correct response.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            We also cannot issue religious rulings. The Shariah badge on this site reports
            membership of the exchange&apos;s Islamic index and nothing more. For a ruling on your
            own situation, ask a qualified scholar.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">How long we take</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            SmartSarmaya is run by a very small team alongside other work, so replies usually take
            two to three working days and can take longer around Eid and public holidays. Reported
            data errors are looked at sooner than that, often the same day, because a wrong number
            on a public page is the worst thing this site can do.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            Please never send us your CDC account number, broker login, bank details, CNIC or any
            password. We will never ask for them, and anyone who does while claiming to be us is
            not us.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">Before you write</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            A lot of questions are already answered on the site.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/about"
              className="focus-ring rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              How the halal screening works
            </Link>
            <Link
              href="/track-record"
              className="focus-ring rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-slate-400 hover:bg-slate-50"
            >
              See how the picks performed
            </Link>
          </div>
        </div>

        <p className="mt-6 text-sm leading-relaxed text-slate-600">
          {SITE_NAME} is an independent site operated from Pakistan. It is not affiliated with the
          Pakistan Stock Exchange, the SECP, or any broker or listed company.
        </p>

        <Disclaimer className="mt-6" />
      </div>
    </div>
  );
}
