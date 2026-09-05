import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
import Footer from "@/components/site/Footer";
import Navbar from "@/components/site/Navbar";
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
    default: "SmartSarmaya | Halal AI stock research for PSX and the KSE-100",
    template: "%s | SmartSarmaya",
  },
  description:
    "Free AI research for the Pakistan Stock Exchange. Audit your portfolio, analyse any listed company, and read halal stock picks screened against the KMI All Shares Islamic Index. Educational only, not financial advice.",
  keywords: [
    "PSX",
    "Pakistan Stock Exchange",
    "KSE-100",
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
    title: "SmartSarmaya | Halal AI stock research for PSX",
    description:
      "Audit your PSX portfolio and read AI halal picks screened against the exchange's own Islamic index. Free, no account needed.",
    url: SITE_URL,
    siteName: "SmartSarmaya",
    locale: "en_PK",
    type: "website",
    images: [
      {
        url: "/images/banner 1.jpg",
        width: 1200,
        height: 630,
        alt: "SmartSarmaya, halal AI stock research for the Pakistan Stock Exchange",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartSarmaya | Halal AI stock research for PSX",
    description:
      "Audit your PSX portfolio and read AI halal picks screened against the exchange's own Islamic index.",
    images: ["/images/banner 1.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
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
      <head>
        {adsenseClient ? (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
          />
        ) : null}
      </head>
      <body className="flex min-h-full flex-col font-sans antialiased">
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
