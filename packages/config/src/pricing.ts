import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type PricingConfig = {
  currency: "USD";
  openAiInputUsdPer1MTokens: number;
  openAiOutputUsdPer1MTokens: number;
  voiceUsdPerMinute: number;
  liveAvatarUsdPerMinute: number;
};

export function createPricingConfig(env: RawEnv): PricingConfig {
  return {
    currency: "USD",
    openAiInputUsdPer1MTokens: env.PRICING_OPENAI_INPUT_USD_PER_1M_TOKENS,
    openAiOutputUsdPer1MTokens: env.PRICING_OPENAI_OUTPUT_USD_PER_1M_TOKENS,
    voiceUsdPerMinute: env.PRICING_VOICE_USD_PER_MINUTE,
    liveAvatarUsdPerMinute: env.PRICING_LIVEAVATAR_USD_PER_MINUTE,
  };
}

export const pricingConfig = createPricingConfig(rawEnv);
