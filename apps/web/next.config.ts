import type { NextConfig } from "next";
import path from "path";
import fs from "fs";
import { config } from "dotenv";

// Load environment variables from monorepo root .env.local
const rootEnvPath = path.resolve(__dirname, "../../.env.local");
const localEnvPath = path.resolve(__dirname, ".env.local");

// Always sync root .env.local to local .env.local if root exists
if (fs.existsSync(rootEnvPath)) {
  // Load root .env.local into process.env
  const result = config({ path: rootEnvPath });
  if (result.error) {
    console.warn("⚠️  Error loading root .env.local:", result.error);
  } else {
    console.log("✅ Loaded environment variables from root .env.local");
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
    console.log("✅ Synced root .env.local to apps/web/.env.local");
  }
} else {
  console.warn("⚠️  Root .env.local not found at:", rootEnvPath);
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
