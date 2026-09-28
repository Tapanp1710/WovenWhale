import type { NextConfig } from "next";

// Share the repository-root .env with the backend (Node built-in loader).
try {
  process.loadEnvFile("../.env");
} catch {
  // Variables supplied by the host platform.
}

// A hosted build must never fall back to localhost.
if (process.env.VERCEL) {
  for (const key of ["BACKEND_URL", "SITE_URL"]) {
    if (!process.env[key]?.startsWith("https://")) throw new Error(`Set ${key} to an https:// URL in the Vercel project settings.`);
  }
}
const backend = process.env.BACKEND_URL ?? "http://localhost:4000";
const supabaseHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : null;

const nextConfig: NextConfig = {
  transpilePackages: ["@wovenwhale/backend"],
  poweredByHeader: false,
  agentRules: false,
  // Dev server: accept the same hosts the API accepts (ALLOWED_ORIGINS), e.g. a LAN/WSL IP.
  allowedDevOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => URL.canParse(o))
    .map((o) => new URL(o).hostname),
  experimental: {
    // Turbopack's on-disk dev cache speeds restarts but can grow past 1 GB;
    // set NEXT_DEV_FS_CACHE=false on disk-constrained machines.
    turbopackFileSystemCacheForDev: process.env.NEXT_DEV_FS_CACHE !== "false",
  },
  images: {
    qualities: [60, 75, 90],
    formats: ["image/webp"],
    remotePatterns: [
      // Legacy WooCommerce media (current product photography).
      { protocol: "https", hostname: "wovenwhale.com", pathname: "/wp-content/uploads/**" },
      ...(supabaseHost ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }] : []),
    ],
    localPatterns: [{ pathname: "/api/uploads/**" }, { pathname: "/brand/**" }, { pathname: "/catalog/**" }],
  },
  // The browser talks to the commerce API through the storefront origin, so
  // session cookies stay first-party and SameSite protections apply.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
