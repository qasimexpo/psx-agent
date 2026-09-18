import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer, SectionHeading } from "@/components/ui/Primitives";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How SmartSarmaya handles data: no accounts, no stored portfolios, and what Google Analytics and AdSense cookies collect when you use our free PSX tools.",
  alternates: { canonical: "/privacy-policy" },
};

const LAST_UPDATED = "5 September 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <SectionHeading
          as="h1"
          eyebrow={`Last updated ${LAST_UPDATED}`}
          title="Privacy policy"
          description="What we collect, what we do not collect, and which third parties see anything at all. Written to be read rather than skimmed past."
        />

        <div className="card p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">The short version</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            SmartSarmaya has no accounts, no login and no registration, so we hold no name, email
            address, phone number or password for you. Portfolio holdings you type into the audit
            tool are used to answer that one request and are never written to our database. What
            does happen is ordinary web hosting: our server keeps short lived request logs, and
            Google Analytics and Google AdSense run on the site and set their own cookies.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">1. Who we are</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            {SITE_NAME} is an independent educational research site covering the Pakistan Stock
            Exchange, operated from Pakistan. This policy covers the website at smartsarmaya.com
            and its subdomains. You can reach us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">2. What we do not collect</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>
              <strong className="text-navy-900">No accounts.</strong> There is no sign up, no
              login and no password, so there is no user profile to store, breach or sell.
            </li>
            <li>
              <strong className="text-navy-900">No stored portfolios.</strong> When you enter
              symbols, quantities and buy prices into the portfolio audit tool, that information is
              held in memory only for as long as it takes to produce your report. It is not written
              to our database, not attached to an identity, and not reused for any other purpose.
              Close the tab and it is gone.
            </li>
            <li>
              <strong className="text-navy-900">No financial account details.</strong> We never ask
              for your CDC account number, broker credentials, bank details, CNIC or NTN, and you
              should never send them to us.
            </li>
            <li>
              <strong className="text-navy-900">No payment data.</strong> The site is free, so
              there is no checkout and no card processing.
            </li>
          </ul>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">3. What is collected</h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
            <li>
              <strong className="text-navy-900">Server logs and IP address.</strong> Like any
              website, our hosting records each request with an IP address, timestamp, the page or
              API route requested, browser user agent and referring page. We use this to keep the
              site running, to debug errors, and to apply rate limits so that one visitor or bot
              cannot exhaust the free AI quota that funds the tools for everyone else. These logs
              are retained for a short operational period and are not used to build a profile of
              you.
            </li>
            <li>
              <strong className="text-navy-900">Analytics events.</strong> Google Analytics records
              which pages are viewed, roughly where in the world the visit came from, the device
              and browser type, and how visitors move between pages. We look at this in aggregate
              to decide what to build next.
            </li>
            <li>
              <strong className="text-navy-900">Advertising signals.</strong> Google AdSense
              collects the information it needs to serve and measure ads. See section 5.
            </li>
            <li>
              <strong className="text-navy-900">Anything you email us.</strong> If you write to us,
              we keep that message and your email address for as long as needed to deal with it.
            </li>
          </ul>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">4. Google Analytics</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            We use Google Analytics to understand traffic. It sets cookies in your browser and
            sends usage data to Google. We do not send Google Analytics any portfolio content, any
            stock symbols you looked up privately in the audit tool, or anything that identifies
            you personally. You can block it with a browser extension such as the Google Analytics
            opt out add on, or with any standard content blocker, and the site will still work.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">
            5. Google AdSense, cookies and personalised advertising
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            SmartSarmaya is free because it carries advertising served by Google AdSense. This is
            the only thing paying for the hosting, the database and the domain.
          </p>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>
              Third party vendors, including Google, use cookies to serve ads based on your prior
              visits to this website or other websites.
            </li>
            <li>
              Google&apos;s use of advertising cookies enables it and its partners to serve ads to
              you based on your visit to this site and other sites on the internet.
            </li>
            <li>
              You can opt out of personalised advertising by visiting Google Ads Settings at
              adssettings.google.com. Turning personalisation off does not remove ads, it only
              makes them less targeted.
            </li>
            <li>
              You can opt out of third party vendor cookies more broadly through
              aboutads.info/choices, and you can block or delete cookies in your browser settings
              at any time.
            </li>
            <li>
              Where required, Google presents a consent notice to visitors in regions such as the
              European Economic Area and the United Kingdom before setting non essential cookies.
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            We do not receive your identity from Google. We see aggregate earnings and performance
            reports only.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">6. Third parties who process data</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Running the site means some data passes through infrastructure we do not own. These are
            all of them.
          </p>
          <div className="table-scroll mt-4">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5">Provider</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">What it sees</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-navy-900">Vercel</td>
                  <td className="px-3 py-2.5">Website hosting and delivery</td>
                  <td className="px-3 py-2.5">
                    Request logs, IP address, user agent, requested route
                  </td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-navy-900">Neon</td>
                  <td className="px-3 py-2.5">Database for market data and published picks</td>
                  <td className="px-3 py-2.5">
                    Stock prices, indicators and picks only. No visitor data, no portfolios
                  </td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-navy-900">Groq</td>
                  <td className="px-3 py-2.5">Primary AI model provider, Llama</td>
                  <td className="px-3 py-2.5">
                    The prompt text for your request, including symbols and quantities you entered
                  </td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-navy-900">Google</td>
                  <td className="px-3 py-2.5">
                    Gemini fallback model, Analytics, AdSense, fonts
                  </td>
                  <td className="px-3 py-2.5">
                    Prompt text on fallback, plus analytics and advertising signals
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            When you run a portfolio audit or a stock analysis, the text of that request is sent to
            the AI provider so it can generate the answer. It is not sent with your name or any
            identifier from us, because we do not have one. Each provider handles that request
            under its own privacy terms, so if the composition of your portfolio is sensitive to
            you, consider using the tool with a subset of your holdings.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">7. We do not sell your data</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            We do not sell, rent or trade personal information, and we do not share it with data
            brokers, brokerages, listed companies or fund managers. There is no mailing list to be
            added to. We would disclose information only where a valid legal order under Pakistani
            law required it, or where it was strictly necessary to investigate abuse of the service.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">8. Children</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            SmartSarmaya is intended for adults who are able to open a brokerage account, and it is
            not directed at children under 13. We do not knowingly collect personal information
            from children. If you believe a child has sent us personal information by email, write
            to us and we will delete it.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">9. International transfers</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            The site is operated for a Pakistani audience, but the providers listed above run
            servers outside Pakistan, including in the United States and Europe. Using the site
            means your request data is processed in those countries, where data protection law may
            differ from Pakistani law. We limit what is sent by keeping the site free of accounts
            in the first place.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">10. Your choices</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>Block or delete cookies in your browser at any time.</li>
            <li>Turn off personalised ads at Google Ads Settings.</li>
            <li>Use a content blocker to stop analytics and ad scripts loading.</li>
            <li>
              Simply do not enter holdings you are uncomfortable sending to an AI provider. Every
              other part of the site works without them.
            </li>
            <li>
              Ask us to delete any email correspondence we hold from you by writing to{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </li>
          </ul>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">11. Changes to this policy</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            If we change how data is handled, this page is updated and the date at the top changes
            with it. Continuing to use the site after that means you accept the revised policy.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">12. Contact</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Questions about privacy go to{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            . You may also want the{" "}
            <Link
              href="/terms-of-service"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              terms of service
            </Link>{" "}
            or the{" "}
            <Link
              href="/about"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              about page
            </Link>
            , which explains where the market data comes from.
          </p>
        </div>

        <Disclaimer className="mt-8" />
      </div>
    </div>
  );
}
