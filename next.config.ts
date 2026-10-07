import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser opens via 127.0.0.1; without this, Next can block /_next chunks
  // and leave the login page without working client handlers.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  ...(process.env.NEXT_DIST_DIR
    ? { distDir: process.env.NEXT_DIST_DIR }
    : {}),
};

export default nextConfig;
