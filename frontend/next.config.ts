import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Prevent Turbopack from treating the monorepo root as the app root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
