import type { NextConfig } from "next";
import path from "node:path";

function absoluteApiUrl(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return value.replace(/\/+$/, "");
      }
    } catch {
      // Browser-only values such as /api cannot be a rewrite destination host.
    }
  }
  return "http://127.0.0.1:8000";
}

const apiUrl = absoluteApiUrl(
  process.env.API_INTERNAL_URL,
  process.env.NEXT_PUBLIC_API_URL,
);

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: [
    "@hanuman/shared-types",
    "@hanuman/video-engine",
  ],
  // Linux cloud images use standalone. Local Windows builds avoid privileged symlinks.
  ...(process.env.VERCEL || process.platform === "win32" ? {} : { output: "standalone" as const }),
  // Hide Next.js "N" badge — it sat bottom-right over the editor and was mistaken for a user avatar.
  devIndicators: false,
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "9000", pathname: "/**" },
      { protocol: "https", hostname: "s3.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "*.cloudfront.net", pathname: "/**" },
    ],
  },
  async headers() {
    return [
      {
        // Auth pages must never retain a stale client bundle after a deployment.
        source: "/sign-in",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
      },
      {
        source: "/sign-up",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
      },
      {
        // Content-hashed Next assets — long immutable cache at the edge/browser.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: process.env.NODE_ENV === "development"
            ? "no-store, max-age=0, must-revalidate"
            : "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  async rewrites() {
    // Use fallback so App Router handlers (/api/auth, /api/me, billing, webhooks)
    // win first. Only unmatched /api/* is proxied to FastAPI.
    return {
      fallback: [
        {
          // Never proxy FastAPI's service-to-service /internal namespace through
          // the public web origin. App Router's own /api/internal/credits handler
          // still wins before fallback rewrites.
          source: "/api/:path((?!internal(?:/|$)).*)",
          destination: `${apiUrl}/:path`,
        },
      ],
    };
  },
};

export default nextConfig;
