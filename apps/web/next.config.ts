import type { NextConfig } from "next";

const apiUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@hanuman/shared-types",
    "@hanuman/remotion-renderer",
    "remotion",
    "@remotion/player",
    "@remotion/transitions",
    "@remotion/media-utils",
  ],
  // Keep Remotion server/Node packages out of the Next bundler.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/cli",
    "@remotion/lambda",
    "@remotion/renderer",
  ],
  // ECS/Docker uses standalone; Vercel uses its own Next output tracing.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  // Hide Next.js "N" badge — it sat bottom-right over the editor and was mistaken for a user avatar.
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "9000", pathname: "/**" },
      { protocol: "https", hostname: "s3.amazonaws.com", pathname: "/**" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
