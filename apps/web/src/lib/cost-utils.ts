/**
 * Cost tracking utilities for token usage and USD estimation.
 * Supports multiple providers (OpenAI, Gemini, etc.)
 */

// Pricing per 1M tokens (input/output)
const PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI models
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  // Google Gemini models
  "gemini-1.5-pro": { input: 1.25, output: 5.0 }, // $1.25/$5.00 per 1M tokens
  "gemini-1.5-flash": { input: 0.075, output: 0.3 }, // $0.075/$0.30 per 1M tokens
  "gemini-pro": { input: 0.5, output: 1.5 },
  "gemini-1.0-pro": { input: 0.5, output: 1.5 },
};

const DEFAULT_MODEL = "gpt-4o-mini";

export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
}

export function estimateCost(usage: TokenUsage, model: string = DEFAULT_MODEL): number {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING[DEFAULT_MODEL];
  const inputCost = (usage.tokensIn / 1_000_000) * pricing.input;
  const outputCost = (usage.tokensOut / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export function accumulateCost(
  existing: { tokensIn: number; tokensOut: number; usd: number },
  newUsage: TokenUsage,
  model: string = DEFAULT_MODEL
): { tokensIn: number; tokensOut: number; usd: number } {
  const newTokensIn = existing.tokensIn + newUsage.tokensIn;
  const newTokensOut = existing.tokensOut + newUsage.tokensOut;
  const newTotalUsage: TokenUsage = { tokensIn: newTokensIn, tokensOut: newTokensOut };
  const newUsd = estimateCost(newTotalUsage, model);
  return {
    tokensIn: newTokensIn,
    tokensOut: newTokensOut,
    usd: newUsd,
  };
}

