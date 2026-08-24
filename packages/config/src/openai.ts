import { ConfigError } from "./errors";
import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type OpenAiConfig = {
  apiKey: string;
  defaultModel: string;
  groupRouterModel: string;
  groupRouterTimeoutMs: number;
  embeddingsModel: string;
};

export function createOpenAiConfig(env: RawEnv): OpenAiConfig {
  return {
    apiKey: env.OPENAI_API_KEY ?? "",
    defaultModel: env.OPENAI_DEFAULT_MODEL,
    groupRouterModel: env.OPENAI_GROUP_ROUTER_MODEL,
    groupRouterTimeoutMs: env.OPENAI_GROUP_ROUTER_TIMEOUT_MS,
    embeddingsModel: env.OPENAI_EMBEDDINGS_MODEL,
  };
}

export const openAiConfig = createOpenAiConfig(rawEnv);

export function hasOpenAiConfig(config: OpenAiConfig = openAiConfig): boolean {
  return config.apiKey.length > 0;
}

export function requireOpenAiConfig(config: OpenAiConfig = openAiConfig): OpenAiConfig {
  if (!hasOpenAiConfig(config)) {
    throw new ConfigError("OpenAI is not configured", ["OPENAI_API_KEY is required"]);
  }

  return config;
}
