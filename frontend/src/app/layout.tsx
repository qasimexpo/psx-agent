import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
import Footer from "@/components/site/Footer";
import Navbar from "@/components/site/Navbar";
import NewsletterSlideIn from "@/components/tools/NewsletterSlideIn";
import JsonLd from "@/components/JsonLd";
import { getAdsenseClientId } from "@/lib/adsense";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const adsenseClient = getAdsenseClientId();
const analyticsId = process.env.NEXT_PUBLIC_GA_ID ?? "G-835C87WVVW";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b132b",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SmartSarmaya | Shariah-compliant AI research for the PSX",
    template: "%s | SmartSarmaya",
  },
  description:
    "Free AI research for the Pakistan Stock Exchange. Audit your portfolio, analyse any listed company, and read Shariah-compliant stock picks screened against the KMI All Shares Islamic Index. Educational only, not financial advice.",
  keywords: [
    "PSX",
    "Pakistan Stock Exchange",
    "KSE-100",
    "Shariah compliant stocks Pakistan",
    "halal stocks Pakistan",
    "Shariah compliant stocks PSX",
    "KMI All Shares Islamic Index",
    "PSX portfolio analyser",
    "Pakistan stock market AI",
    "SmartSarmaya",
  ],
  authors: [{ name: "SmartSarmaya" }],
  applicationName: "SmartSarmaya",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/favicon.ico",
  },
  alternates: { canonical: "/" },
  openGraph: {
    title: "SmartSarmaya | Shariah-compliant AI research for the PSX",
    description:
      "Audit your PSX portfolio and read AI Shariah-compliant picks screened against the exchange's own Islamic index. Free, no account needed.",
    url: SITE_URL,
    siteName: "SmartSarmaya",
    locale: "en_PK",
    type: "website",
    images: [
      {
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "SmartSarmaya, Shariah-compliant AI stock research for the Pakistan Stock Exchange",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartSarmaya | Shariah-compliant AI research for the PSX",
    description:
      "Audit your PSX portfolio and read AI Shariah-compliant picks screened against the exchange's own Islamic index.",
    images: ["/images/og-default.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  // AdSense verifies site ownership by finding its script in <head>. The
  // script now loads lazily, so this tag, Google's documented alternative,
  // keeps the site verified regardless of how the script is loaded.
  ...(adsenseClient ? { other: { "google-adsense-account": adsenseClient } } : {}),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} h-full scroll-smooth`}
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-full flex-col font-sans antialiased">
        {/* AdSense is the largest script on the page (250 KB, 130-170 ms of
            main-thread work) and it was competing with hydration. Loading it
            once the page is idle keeps LCP and INP clean; the slots queue
            their push() calls and fill as soon as the script arrives. */}
        {adsenseClient ? (
          <Script
            id="adsense"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            strategy="lazyOnload"
            crossOrigin="anonymous"
          />
        ) : null}
        <JsonLd />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy-900 focus:shadow-lg"
        >
          Skip to content
        </a>

        <Navbar />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <NewsletterSlideIn />

        {analyticsId ? (
          <>
            <Script
              id="ga-src"
              src={`https://www.googletagmanager.com/gtag/js?id=${analyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${analyticsId}');
              `}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
