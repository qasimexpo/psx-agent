import {
  CONTACT_EMAIL,
  EDITOR,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SOCIAL_LINKS,
} from "@/lib/site";

/**
 * The brand entity, emitted on every page. Anything that describes one page
 * rather than the site (articles, breadcrumbs, the FAQ) belongs on that page,
 * because Google only accepts structured data that matches the visible text.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/images/logo-512.png`,
      description: SITE_DESCRIPTION,
      areaServed: { "@type": "Country", name: "Pakistan" },
      founder: { "@id": EDITOR.id },
      contactPoint: {
        "@type": "ContactPoint",
        email: CONTACT_EMAIL,
        contactType: "customer support",
        availableLanguage: ["en", "ur"],
      },
      // sameAs is how Google ties the social profiles to this brand.
      ...(SOCIAL_LINKS.length
        ? { sameAs: SOCIAL_LINKS.map((link) => link.href) }
        : {}),
    },
    {
      "@type": "Person",
      "@id": EDITOR.id,
      name: EDITOR.name,
      jobTitle: EDITOR.jobTitle,
      description: EDITOR.bio,
      url: EDITOR.url,
      worksFor: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/stocks?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
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
