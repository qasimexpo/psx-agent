/**
 * The questions readers ask before they trust the site.
 *
 * These render as a visible section on the About page, and that page alone
 * emits them as FAQPage structured data. They used to be injected site-wide
 * from the layout without any matching text on the page, which is exactly the
 * invisible markup Google's structured data policy treats as spam.
 */
export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How do you decide which PSX stocks are halal?",
    answer:
      "Shariah status comes from the KMI All Shares Islamic Index published by the Pakistan Stock Exchange. A stock is labelled Shariah compliant only if the exchange lists it as a constituent. The AI is never asked to make that judgement, and it can only choose among stocks that already passed the screen.",
  },
  {
    question: "Is SmartSarmaya free?",
    answer:
      "Yes. Portfolio audits, stock analysis, halal picks and the daily market brief are all free, with no account or registration. The site is supported by advertising.",
  },
  {
    question: "Do you store my portfolio?",
    answer:
      "No. Holdings you enter are used to compute the audit in that request and are never written to a database or associated with you.",
  },
  {
    question: "Where does the market data come from?",
    answer:
      "Prices, index levels, dividend announcements and corporate calendars come from the Pakistan Stock Exchange data portal. Technical indicators are calculated from five years of exchange closing prices. Data may be delayed.",
  },
  {
    question: "Is this financial advice?",
    answer:
      "No. SmartSarmaya is an educational research tool. Nothing on it is a recommendation to buy or sell, and nothing on it is a religious ruling. Consult a licensed adviser and a qualified scholar for your own circumstances.",
  },
];

/** FAQPage JSON-LD for a page that renders every item in FAQ_ITEMS. */
export function faqSchema(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
