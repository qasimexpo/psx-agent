const SITE_URL = "https://www.smartsarmaya.com";

const description =
  "SmartSarmaya is an AI-powered educational tool for Pakistan Stock Exchange (PSX) investors. It provides portfolio analysis and market insights for learning purposes only — not financial advice.";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "SmartSarmaya",
      url: SITE_URL,
      logo: `${SITE_URL}/images/logo.jpg`,
      description,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "SmartSarmaya",
      url: SITE_URL,
      description,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
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
