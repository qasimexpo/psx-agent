import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
import { getAdsenseClientId } from "@/lib/adsense";
import "./globals.css";

const adsenseClient = getAdsenseClientId();

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.smartsarmaya.com"),
  title: "SmartSarmaya | AI Stock Advisor for PSX & KSE-100",
  description:
    "SmartSarmaya is an AI Stock Advisor for PSX (Pakistan Stock Exchange) and KSE-100 investors. Get live portfolio analysis, risk alerts, and actionable buy/sell guidance.",
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
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SmartSarmaya | AI Stock Advisor for PSX & KSE-100",
    description:
      "Track PSX and KSE-100 with AI-powered portfolio audits, risk insights, and smart action plans for Pakistan Stock Exchange investors.",
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
      "AI-powered portfolio analysis and risk insights for PSX and KSE-100 investors.",
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
      <body className="min-h-full flex flex-col font-sans antialiased">
        {adsenseClient && (
          <Script
            id="adsense-script"
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        {children}
      </body>
    </html>
  );
}
