import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },

  // The site previously had two URLs for each legal page. Duplicate thin pages
  // are a known AdSense and SEO problem, so the old paths now redirect to the
  // canonical ones instead of serving a second copy.
  async redirects() {
    return [
      // The canonical host is www. Without this, the apex domain served a
      // second full copy of the site and search engines had to guess which
      // one to rank. Vercel can also do this from the Domains settings; the
      // rule lives here so a fresh deployment behaves the same way.
      {
        source: "/:path*",
        has: [{ type: "host", value: "smartsarmaya.com" }],
        destination: "https://www.smartsarmaya.com/:path*",
        permanent: true,
      },
      { source: "/privacy", destination: "/privacy-policy", permanent: true },
      { source: "/terms", destination: "/terms-of-service", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Report-only for now: violations show in the browser console and
          // nothing is blocked. Once a week of real traffic has produced no
          // surprises, rename the key to Content-Security-Policy. AdSense
          // and Analytics need the Google origins; Next's own inline
          // bootstrap needs 'unsafe-inline' without a nonce pipeline.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google https://www.googletagmanager.com https://*.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
              "frame-src https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
