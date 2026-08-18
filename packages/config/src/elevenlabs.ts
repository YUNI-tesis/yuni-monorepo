import { ConfigError } from "./errors";
import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type ElevenLabsConfig = {
  apiKey: string;
  baseUrl: string;
  defaultVoiceId: string;
  agentLlmModel: string;
  agentTtsModel: string;
  requestTimeoutMs: number;
  ragMaxDocumentsLength?: number;
};

export function createElevenLabsConfig(env: RawEnv): ElevenLabsConfig {
  return {
    apiKey: env.ELEVENLABS_API_KEY ?? "",
    baseUrl: env.ELEVENLABS_BASE_URL,
    defaultVoiceId: env.ELEVENLABS_DEFAULT_VOICE_ID ?? "",
    agentLlmModel: env.ELEVENLABS_AGENT_LLM_MODEL,
    agentTtsModel: env.ELEVENLABS_AGENT_TTS_MODEL,
    requestTimeoutMs: env.ELEVENLABS_REQUEST_TIMEOUT_MS,
    ragMaxDocumentsLength: env.ELEVENLABS_RAG_MAX_DOCUMENTS_LENGTH,
  };
}

export const elevenLabsConfig = createElevenLabsConfig(rawEnv);

export function hasElevenLabsConfig(config: ElevenLabsConfig = elevenLabsConfig): boolean {
  return config.apiKey.length > 0;
}

export function requireElevenLabsConfig(config: ElevenLabsConfig = elevenLabsConfig): ElevenLabsConfig {
  if (!hasElevenLabsConfig(config)) {
    throw new ConfigError("ElevenLabs is not configured", ["ELEVENLABS_API_KEY is required"]);
  }

  return config;
}

export function hasElevenLabsDefaultVoice(config: ElevenLabsConfig = elevenLabsConfig): boolean {
  return config.defaultVoiceId.length > 0;
}

export function requireElevenLabsDefaultVoice(config: ElevenLabsConfig = elevenLabsConfig): ElevenLabsConfig {
  const elevenLabs = requireElevenLabsConfig(config);

  if (!hasElevenLabsDefaultVoice(elevenLabs)) {
    throw new ConfigError("ElevenLabs default voice is not configured", [
      "ELEVENLABS_DEFAULT_VOICE_ID is required for legacy non-ElevenLabs avatar voices",
    ]);
  }

  return elevenLabs;
}
