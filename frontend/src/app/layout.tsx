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
  title: "SmartSarmaya — AI PSX Portfolio Auditor",
  description:
    "Get institutional-grade AI portfolio analysis for the Pakistan Stock Exchange in seconds. Free, anonymous, no login required.",
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
