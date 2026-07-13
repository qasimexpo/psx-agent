import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
import JsonLd from "@/components/JsonLd";
import { getAdsenseClientId } from "@/lib/adsense";
import "./globals.css";

const adsenseClient = getAdsenseClientId();
const googleAnalyticsId = "G-835C87WVVW";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B132B",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.smartsarmaya.com"),
  title: "SmartSarmaya | AI Stock Advisor for PSX & KSE-100",
  description:
    "SmartSarmaya is an AI-powered educational tool for Pakistan Stock Exchange (PSX) and KSE-100 investors. Explore portfolio analysis, risk insights, and market data for learning purposes only — not financial advice.",
  keywords: [
    "PSX",
    "Pakistan Stock Exchange",
    "KSE-100",
    "AI Stock Advisor",
    "PSX stocks",
    "Pakistan stock market",
    "portfolio analyzer Pakistan",
    "SmartSarmaya",
  ],
  authors: [{ name: "SmartSarmaya" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/favicon.ico",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SmartSarmaya | AI Stock Advisor for PSX & KSE-100",
    description:
      "An AI-powered educational tool for the Pakistan Stock Exchange (PSX). Portfolio analysis, risk insights, and market data for learning purposes only — not financial advice.",
    url: "https://www.smartsarmaya.com",
    siteName: "SmartSarmaya",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/images/banner 1.jpg",
        width: 1200,
        height: 630,
        alt: "SmartSarmaya AI PSX Portfolio Auditor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartSarmaya | AI Stock Advisor for PSX & KSE-100",
    description:
      "An AI-powered educational tool for the Pakistan Stock Exchange (PSX). Portfolio analysis and risk insights for learning purposes only.",
    images: ["/images/banner 1.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full scroll-smooth`}>
      <head>
        {adsenseClient && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <JsonLd />
        <Script
          id="gtag-src"
          src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${googleAnalyticsId}');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
