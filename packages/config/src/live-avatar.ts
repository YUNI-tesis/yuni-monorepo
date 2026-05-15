import { ConfigError } from "./errors";
import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type LiveAvatarConfig = {
  apiKey: string;
  baseUrl: string;
  sandbox: true;
  mode: "lite";
};

export function createLiveAvatarConfig(env: RawEnv): LiveAvatarConfig {
  if (env.LIVEAVATAR_SANDBOX !== true) {
    throw new ConfigError("Live Avatar sandbox must be enabled", ["LIVEAVATAR_SANDBOX must be true"]);
  }

  return {
    apiKey: env.LIVEAVATAR_API_KEY ?? "",
    baseUrl: env.LIVEAVATAR_BASE_URL,
    sandbox: true,
    mode: env.LIVEAVATAR_MODE,
  };
}

export const liveAvatarConfig = createLiveAvatarConfig(rawEnv);

export function hasLiveAvatarConfig(config: LiveAvatarConfig = liveAvatarConfig): boolean {
  return config.apiKey.length > 0;
}

export function requireLiveAvatarConfig(config: LiveAvatarConfig = liveAvatarConfig): LiveAvatarConfig {
  if (!hasLiveAvatarConfig(config)) {
    throw new ConfigError("Live Avatar is not configured", ["LIVEAVATAR_API_KEY is required"]);
  }

  return config;
}
