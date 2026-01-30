import type { NextConfig } from "next";
import path from "path";
import fs from "fs";
import { config } from "dotenv";

// Load environment variables from monorepo root .env
const rootEnvPath = path.resolve(__dirname, "../../.env");
const localEnvPath = path.resolve(__dirname, ".env.local");

// Always sync root .env to local .env.local if root exists
if (fs.existsSync(rootEnvPath)) {
  // Load root .env into process.env
  const result = config({ path: rootEnvPath });
  if (result.error) {
    console.warn("⚠️  Error loading root .env:", result.error);
  } else {
    console.log("✅ Loaded environment variables from root .env");
  }

  // Always sync/copy root to local so Next.js can read it automatically
  // Check if files are different before copying
  let shouldCopy = true;
  if (fs.existsSync(localEnvPath)) {
    const rootStats = fs.statSync(rootEnvPath);
    const localStats = fs.statSync(localEnvPath);
    // Only copy if root is newer or files are different
    shouldCopy = rootStats.mtime > localStats.mtime || 
                 fs.readFileSync(rootEnvPath, "utf8") !== fs.readFileSync(localEnvPath, "utf8");
  }

  if (shouldCopy) {
    fs.copyFileSync(rootEnvPath, localEnvPath);
    console.log("✅ Synced root .env to apps/web/.env.local");
  }
} else {
  console.warn("⚠️  Root .env not found at:", rootEnvPath);
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'yuni-ai.s3.us-east-2.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.s3.*.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
