/**
 * LLM Configuration - Model-agnostic configuration
 * Supports multiple providers via environment variables
 */

export type LLMProvider = "openai" | "gemini";

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  temperature?: number;
}

/**
 * Gets LLM configuration from environment variables.
 * 
 * Environment variables:
 * - LLM_PROVIDER: "openai" | "gemini" (default: "openai")
 * - LLM_MODEL: model name (default depends on provider)
 * - OPENAI_API_KEY: required if provider is "openai"
 * - GOOGLE_API_KEY: required if provider is "gemini"
 * - LLM_TEMPERATURE: temperature (default: 0.7)
 */
export function getLLMConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER || "openai") as LLMProvider;
  const temperature = parseFloat(process.env.LLM_TEMPERATURE || "0.7");

  let apiKey: string;
  let defaultModel: string;

  if (provider === "openai") {
    apiKey = process.env.OPENAI_API_KEY || "";
    defaultModel = "gpt-4o-mini";
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required when using OpenAI provider");
    }
  } else if (provider === "gemini") {
    apiKey = process.env.GOOGLE_API_KEY || "";
    defaultModel = "gemini-1.5-pro";
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY environment variable is required when using Gemini provider");
    }
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}. Supported providers: openai, gemini`);
  }

  const model = process.env.LLM_MODEL || defaultModel;

  return {
    provider,
    model,
    apiKey,
    temperature,
  };
}

/**
 * Gets the model name from configuration.
 * Useful for cost tracking and other model-specific operations.
 */
export function getModelName(): string {
  return getLLMConfig().model;
}

