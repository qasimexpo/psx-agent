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
