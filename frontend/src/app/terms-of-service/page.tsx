import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer, SectionHeading } from "@/components/ui/Primitives";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms for using SmartSarmaya, the free AI research site for the Pakistan Stock Exchange. Educational use only, not financial advice and not a fatwa.",
  alternates: { canonical: "/terms-of-service" },
};

const LAST_UPDATED = "5 September 2026";

export default function TermsOfServicePage() {
  return (
    <div className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <SectionHeading
          as="h1"
          eyebrow={`Last updated ${LAST_UPDATED}`}
          title="Terms of service"
          description="The rules for using this site. The important part is section 3: everything here is educational, and none of it is advice."
        />

        <div className="card p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">1. Acceptance</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            By using {SITE_NAME} at smartsarmaya.com, including any page, tool, feed or API route
            on it, you agree to these terms. If you do not agree with any part of them, please stop
            using the site. These terms apply whether or not you contact us, and there is nothing
            to sign because there is no account.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">2. Eligibility</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            You must be at least 18 years old, or the age of legal majority where you live, and
            legally capable of entering into a binding agreement. You are responsible for making
            sure that using an educational research site is lawful in your country. The site is
            written for a Pakistani audience and does not attempt to comply with the securities
            marketing rules of every other jurisdiction.
          </p>
        </div>

        <div className="card mt-5 border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 className="text-base font-bold text-amber-900">
            3. Educational only. Not advice, and not a religious ruling
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            Everything on SmartSarmaya is published for general education and information. It is
            not financial advice, not investment advice, not a recommendation to buy, sell or hold
            any security, and not a solicitation of any kind. It takes no account of your income,
            your obligations, your time horizon or your tolerance for loss, because we do not know
            them.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            Nothing on the site is a religious ruling. It is not a fatwa and we are not qualified
            to issue one. Any Shariah label is a report of index membership, described in section 5.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-900">
            We are not registered with the Securities and Exchange Commission of Pakistan as an
            investment adviser, securities adviser, broker or dealer, and we are not licensed in
            any other jurisdiction. We do not manage money and we cannot execute trades.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">4. No adviser relationship</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Using the site, running a portfolio audit, or emailing us does not create an adviser
            and client relationship, a fiduciary duty, a brokerage relationship or any professional
            engagement between you and us. Every investment decision you make is yours alone, and
            so is the outcome. If you need advice on your own situation, consult a licensed
            financial adviser in Pakistan.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">
            5. What the Shariah labels actually mean
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            A stock is marked Shariah verified on this site when the Pakistan Stock Exchange lists
            it as a constituent of the KMI All Shares Islamic Index. That is the entire test. We do
            not run our own screen, and the AI model does not decide compliance. The model can only
            select among stocks the exchange has already screened.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Index membership is reviewed periodically by the exchange, so a company can be included
            in one period and excluded in the next, and our page may lag the exchange between
            updates. Index membership is also a broad screen rather than a personal ruling on your
            circumstances, and scholars differ on methodology. If compliance matters to you, verify
            the current constituent list on dps.psx.com.pk and consult a qualified scholar before
            acting.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">6. Market data, accuracy and delay</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Prices, volumes, index levels, dividend announcements, book closure dates and meeting
            calendars are sourced from the PSX Data Portal. This data may be delayed, incomplete,
            stale or temporarily unavailable. Technical indicators, support and resistance levels,
            52 week ranges and volatility figures are calculated from daily closing prices, so they
            do not reflect intraday movement.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            The site is provided on an as is and as available basis, without warranty of any kind,
            express or implied, including any warranty of accuracy, completeness, merchantability
            or fitness for a particular purpose. Confirm every price with your broker or the
            exchange before you place an order. AI generated text can contain errors and can be
            confidently wrong. Past performance shown on the{" "}
            <Link
              href="/track-record"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              track record page
            </Link>{" "}
            does not predict future results.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">7. Acceptable use</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">You agree not to:</p>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>
              Scrape, crawl, harvest or bulk download content from the site or its API routes,
              other than normal indexing by a search engine that respects our robots file.
            </li>
            <li>
              Send automated or excessive requests. Rate limits are applied per client, and we may
              throttle or block any traffic that threatens the free AI quota the tools depend on.
            </li>
            <li>
              Reverse engineer, decompile or attempt to derive the prompts, models or pipeline
              behind the site, or probe it for vulnerabilities without permission.
            </li>
            <li>
              Republish or resell the analysis, picks or data as your own product, or present it as
              licensed advice.
            </li>
            <li>
              Use the site to manipulate a market, to promote a security you hold, or in any way
              that breaches Pakistani securities law.
            </li>
            <li>
              Interfere with the operation of the site, introduce malicious code, or circumvent any
              access or rate control.
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            Reasonable personal use, including quoting a page with a link back to it, is welcome.
            We may suspend access for anyone who breaks these rules, without notice.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">8. Intellectual property</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            The design, code, written commentary and the way the analysis is presented belong to
            SmartSarmaya. Underlying market data belongs to the Pakistan Stock Exchange and its
            licensors, and the KMI All Shares Islamic Index and its constituent list are the
            property of the exchange. Company names and ticker symbols belong to their owners. We
            are not affiliated with, endorsed by or sponsored by the Pakistan Stock Exchange, the
            SECP, any listed company, or any AI provider named on the site.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">9. Third party links and advertising</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            The site links to external sites, including the PSX Data Portal, and carries
            advertising served by Google AdSense. We do not control that content, we do not endorse
            advertisers, and we are not responsible for anything you do on another site. Advertisers
            have no influence over which stocks appear or what the analysis says. Read the{" "}
            <Link
              href="/privacy-policy"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              privacy policy
            </Link>{" "}
            for how advertising cookies work and how to opt out of personalised ads.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">10. Limitation of liability</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            To the fullest extent permitted by law, SmartSarmaya and the people who operate it are
            not liable for any trading loss, lost profit, missed opportunity, tax consequence, data
            error, service interruption, or any indirect, incidental, special or consequential
            damage arising from your use of the site or your reliance on anything published on it.
            This includes losses caused by delayed or incorrect market data, by an incorrect
            Shariah label, or by AI generated text that turns out to be wrong. You use the site at
            your own risk, and you alone are responsible for your trades, your risk management and
            your compliance with tax and regulatory obligations.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">11. Indemnity</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            You agree to indemnify and hold harmless SmartSarmaya and its operators against any
            claim, loss, liability or reasonable legal cost arising from your misuse of the site,
            your breach of these terms, or your violation of any law or third party right.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">12. Changes and availability</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            We may change these terms at any time. The revised version applies from the moment it
            is published on this page, and the date at the top changes with it. Continuing to use
            the site means you accept it. We may also change, suspend or discontinue any feature,
            including the free tools, at any time and without notice. Nothing here promises the
            site will remain available.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">13. Governing law</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            These terms are governed by the laws of the Islamic Republic of Pakistan. Any dispute
            arising out of them or out of your use of the site is subject to the exclusive
            jurisdiction of the courts of Pakistan. If any provision is found unenforceable, the
            rest stays in force.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">14. Contact</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Questions about these terms go to{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            . The{" "}
            <Link
              href="/about"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              about page
            </Link>{" "}
            explains the method and its limits in more detail.
          </p>
        </div>

        <Disclaimer className="mt-8" />
      </div>
    </div>
  );
}
