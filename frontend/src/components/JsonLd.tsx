import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/images/logo.jpg`,
      description: SITE_DESCRIPTION,
      areaServed: { "@type": "Country", name: "Pakistan" },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "How do you decide which PSX stocks are halal?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Shariah status comes from the KMI All Shares Islamic Index published by the Pakistan Stock Exchange. A stock is labelled Shariah compliant only if the exchange lists it as a constituent. The AI is never asked to make that judgement, and it can only choose among stocks that already passed the screen.",
          },
        },
        {
          "@type": "Question",
          name: "Is SmartSarmaya free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Portfolio audits, stock analysis, halal picks and the daily market brief are all free, with no account or registration. The site is supported by advertising.",
          },
        },
        {
          "@type": "Question",
          name: "Do you store my portfolio?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Holdings you enter are used to compute the audit in that request and are never written to a database or associated with you.",
          },
        },
        {
          "@type": "Question",
          name: "Where does the market data come from?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Prices, index levels, dividend announcements and corporate calendars come from the Pakistan Stock Exchange data portal. Technical indicators are calculated from five years of exchange closing prices. Data may be delayed.",
          },
        },
        {
          "@type": "Question",
          name: "Is this financial advice?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. SmartSarmaya is an educational research tool. Nothing on it is a recommendation to buy or sell, and nothing on it is a religious ruling. Consult a licensed adviser and a qualified scholar for your own circumstances.",
          },
        },
      ],
    },
  ],
};

export default function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
