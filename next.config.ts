import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Owner, 2026-11-18: the version this build is, so open tabs can tell a newer one went live
  env: { NEXT_PUBLIC_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA || "dev" },
  // Browser opens via 127.0.0.1; without this, Next can block /_next chunks
  // and leave the login page without working client handlers.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  ...(process.env.NEXT_DIST_DIR
    ? { distDir: process.env.NEXT_DIST_DIR }
    : {}),
};

export default nextConfig;
