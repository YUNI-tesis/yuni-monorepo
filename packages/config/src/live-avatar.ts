import { ConfigError } from "./errors";
import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type LiveAvatarConfig = {
  apiKey: string;
  baseUrl: string;
  sandbox: boolean;
  mode: string;
  requestTimeoutMs: number;
  elevenLabsSecretId: string;
};

export function createLiveAvatarConfig(env: RawEnv): LiveAvatarConfig {
  return {
    apiKey: env.LIVEAVATAR_API_KEY ?? "",
    baseUrl: env.LIVEAVATAR_BASE_URL,
    sandbox: env.LIVEAVATAR_SANDBOX,
    mode: env.LIVEAVATAR_MODE,
    requestTimeoutMs: env.LIVEAVATAR_REQUEST_TIMEOUT_MS,
    elevenLabsSecretId: env.LIVEAVATAR_ELEVENLABS_SECRET_ID ?? "",
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

export function requireLiveAvatarElevenLabsConnectorConfig(
  config: LiveAvatarConfig = liveAvatarConfig
): LiveAvatarConfig {
  const liveAvatar = requireLiveAvatarConfig(config);

  if (liveAvatar.elevenLabsSecretId.length === 0) {
    throw new ConfigError("Live Avatar ElevenLabs connector is not configured", [
      "LIVEAVATAR_ELEVENLABS_SECRET_ID is required",
    ]);
  }

  return liveAvatar;
}
