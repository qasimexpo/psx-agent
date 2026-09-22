import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer, SectionHeading } from "@/components/ui/Primitives";
import { FAQ_ITEMS, faqSchema } from "@/lib/faq";
import { CONTACT_EMAIL, EDITOR, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * The trust anchor page. Everything here has to be literally true, because the
 * halal claim is the reason anyone stays on the site.
 */
export const metadata: Metadata = {
  title: "About us and how the Shariah screening works",
  description:
    "SmartSarmaya is free AI stock research for the Pakistan Stock Exchange. Learn how our Shariah screening uses the PSX KMI All Shares Islamic Index and real data.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(`${SITE_URL}/about`)) }}
      />
      <div className="mx-auto max-w-3xl">
        <SectionHeading
          as="h1"
          eyebrow="About"
          title={`What ${SITE_NAME} is`}
          description="A free research site for people who invest on the Pakistan Stock Exchange and want to keep their holdings Shariah compliant without paying for a broker research subscription."
        />

        <div className="card p-5 sm:p-6">
          <p className="text-sm leading-relaxed text-slate-700">
            SmartSarmaya reads the Pakistan Stock Exchange data that is already public, computes
            the technical numbers that most retail investors never get time to calculate, and uses
            an AI model to explain what those numbers say in plain language. You can audit a
            portfolio, look up any listed company, and read the Shariah-compliant picks we publish each day.
            There is no account, no login and no fee.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            The site exists because the alternative for most Pakistani retail investors is a
            WhatsApp group. Tips arrive with no price attached, no reasoning, and no record of
            whether the last ten calls worked. Every pick we publish is written down with the price
            at the time and marked to market from then on, winners and losers together, on the{" "}
            <Link
              href="/track-record"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              track record page
            </Link>
            .
          </p>
        </div>

        <div id="editor" className="card mt-5 scroll-mt-20 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">Who is responsible for it</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            <strong className="font-semibold text-navy-900">{EDITOR.name}</strong>,{" "}
            {EDITOR.jobTitle.toLowerCase()}. {EDITOR.bio}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            The briefs, picks and company notes are written by a language model from exchange
            data, as described below, and published automatically. The editor sets the rules the
            model works under, decides what the site does and does not claim, and is the person
            to write to when something on it is wrong:{" "}
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
          <h2 className="text-base font-bold text-navy-900">Who it is for</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Pakistani retail investors, mostly people holding somewhere between a few thousand and
            a few million rupees of PSX stock in a Roshan Digital or local brokerage account. It is
            aimed at the investor who wants to understand a company before buying it, who cares
            whether the stock is Shariah compliant, and who is willing to read a page of reasoning
            rather than act on a one-line tip.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            It is not built for day traders. The indicators are computed from daily closing prices,
            so nothing here is fast enough for intraday work.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">
            How the Shariah screening actually works
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            This is the part that matters most, so it is worth being precise about it.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            Shariah status on this site comes from exactly one source: the{" "}
            <strong className="font-semibold text-navy-900">
              KMI All Shares Islamic Index
            </strong>{" "}
            published by the Pakistan Stock Exchange. A company carries the Shariah verified badge
            here if, and only if, the exchange lists it as a constituent of that index. When the
            exchange adds or removes a company, the badge on this site follows.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            The AI never decides what is Shariah compliant. It is not asked to. Before the model sees anything,
            the candidate list is filtered down to KMI constituents only, so the model is choosing
            among stocks the exchange has already screened. If the model were to name a company
            outside that list, the pick is discarded before it is saved. The compliance decision
            sits with the exchange and the scholars who advise its index methodology, not with a
            language model and not with us.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            Two honest caveats. Index membership is reviewed periodically, so a company can pass a
            screen and later fail one. And index membership is a screen, not a personal ruling. If
            a specific holding matters to you religiously, ask a qualified scholar. We are not one.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">Where the data comes from</h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
            <li>
              <strong className="text-navy-900">Prices and market data.</strong> The PSX Data
              Portal at dps.psx.com.pk. That covers closing prices, open, high, low, volume and
              index levels, plus announced dividends with their book closure dates and the AGM and
              EOGM calendar. This data can be delayed, so treat every price on the site as
              indicative and confirm with your broker before you trade.
            </li>
            <li>
              <strong className="text-navy-900">Shariah status.</strong> The KMI All Shares Islamic
              Index constituent list published by the Pakistan Stock Exchange, and nothing else.
            </li>
            <li>
              <strong className="text-navy-900">Technical indicators.</strong> Computed here from
              roughly five years of exchange closing prices. That includes RSI over 14 periods, the
              20, 50 and 200 day simple moving averages, the 52 week high and low with the current
              position inside that range, realised volatility, and support and resistance levels.
            </li>
            <li>
              <strong className="text-navy-900">The AI models.</strong> Groq running Llama, with
              Google Gemini as the fallback when Groq is unavailable. Both are used on their free
              tiers, which is part of how the site stays free.
            </li>
          </ul>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">How it works, step by step</h2>
          <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>
              <strong className="text-navy-900">1. The universe is filtered first.</strong>{" "}
              Candidates are cut down to constituents of the KMI All Shares Islamic Index before
              anything else happens.
            </li>
            <li>
              <strong className="text-navy-900">2. Real numbers are attached.</strong> Each
              candidate carries its latest price, RSI, moving averages, 52 week position and volume,
              all computed in code from exchange closing prices.
            </li>
            <li>
              <strong className="text-navy-900">3. The model ranks and explains.</strong> It picks
              among the candidates it was given and writes the reasoning. It is not asked to recall
              a price, a ticker or a compliance status from memory.
            </li>
            <li>
              <strong className="text-navy-900">4. Invented tickers are thrown away.</strong> Any
              symbol the model returns that is not in the supplied list is dropped before anything
              is saved.
            </li>
            <li>
              <strong className="text-navy-900">5. Prices come from the database.</strong> Entry
              prices, buy zones and targets are calculated from stored data, never copied from the
              model output, so a hallucinated number cannot reach the page.
            </li>
            <li>
              <strong className="text-navy-900">6. Everything is recorded.</strong> Each pick is
              logged on the day it is made and tracked from there, whatever happens next.
            </li>
          </ol>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">What we deliberately do not do</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>
              We do not give personal investment advice. Nothing here is tailored to your income,
              your goals or your risk tolerance, because we know none of those things.
            </li>
            <li>
              We do not issue religious rulings. The badge reports index membership. It is not a
              fatwa.
            </li>
            <li>
              We are not a broker and we cannot place trades. We are not registered with the SECP
              as an investment adviser.
            </li>
            <li>
              We do not run a paid tier, a signal group, a Telegram channel or a WhatsApp
              subscription, and we do not take payment to feature a stock.
            </li>
            <li>
              We do not store anything about you. There are no accounts, and portfolio holdings you
              type into the audit tool are used for that one request and then discarded.
            </li>
          </ul>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">Limitations, stated honestly</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
            <li>
              <strong className="text-navy-900">Support and resistance are approximations.</strong>{" "}
              They are swing levels derived from daily closing prices, not intraday pivots. Real
              intraday highs and lows can sit well outside them.
            </li>
            <li>
              <strong className="text-navy-900">Data can be delayed or wrong.</strong> Prices come
              from the exchange portal and may lag the live market or arrive incomplete after a
              feed problem. Corporate actions such as splits and bonus issues can distort a history
              before it is adjusted.
            </li>
            <li>
              <strong className="text-navy-900">The analysis is mostly technical.</strong> We do not
              read financial statements line by line, model earnings, or judge management quality.
              A chart cannot tell you a company is about to lose its biggest customer.
            </li>
            <li>
              <strong className="text-navy-900">AI writing can be confidently wrong.</strong> The
              numbers are pinned to the database, but the narrative around them is generated text
              and can misread a situation or overstate a case.
            </li>
            <li>
              <strong className="text-navy-900">The track record is a short sample.</strong> A
              handful of picks over a few months proves very little either way, and returns there
              ignore brokerage, CDC charges and taxes.
            </li>
            <li>
              <strong className="text-navy-900">PSX is a thin market.</strong> Some listed companies
              trade rarely. A signal on a stock with almost no volume is close to meaningless, and
              you may not be able to exit at the price you see.
            </li>
          </ul>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">Free, and how it is funded</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Everything on SmartSarmaya is free to use. The site is paid for by Google AdSense
            advertising, which is why you see ad slots on some pages. We do not accept payment from
            listed companies, brokers or fund managers to cover a stock, and no advertiser has any
            say in what the picks are. If that ever changes it will be stated on this page first.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            Questions, or a data error you want fixed? Write to{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            or see the{" "}
            <Link
              href="/contact"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              contact page
            </Link>
            . The{" "}
            <Link
              href="/privacy-policy"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              privacy policy
            </Link>{" "}
            and{" "}
            <Link
              href="/terms-of-service"
              className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
            >
              terms of service
            </Link>{" "}
            set out the rest.
          </p>
        </div>

        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy-900">Common questions</h2>
          <dl className="mt-3 space-y-4">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question}>
                <dt className="text-sm font-semibold text-navy-900">{item.question}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-700">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Disclaimer className="mt-8" />
      </div>
    </div>
  );
}
