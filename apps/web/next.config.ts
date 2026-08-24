import type { NextConfig } from "next";

const apiInternalUrl = normalizeApiInternalUrl(process.env.API_INTERNAL_URL ?? "http://localhost:4000");

const nextConfig: NextConfig = {
  transpilePackages: ["@yuni/config", "@yuni/ui"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;

function normalizeApiInternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_INTERNAL_URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}
