import { Hono } from "hono";
import {
  ElevenLabsProviderError,
  ElevenLabsProviderTimeoutError,
  ElevenLabsProviderUnavailableError,
  type ElevenLabsAgentProvider,
} from "@yuni/voice";
import { badGatewayError, serviceUnavailableError } from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";

export type VoiceProvidersControllerDependencies = {
  elevenLabsVoiceProvider: Pick<ElevenLabsAgentProvider, "listVoices">;
};

export function createVoiceProvidersController(dependencies: VoiceProvidersControllerDependencies) {
  const voiceProviders = new Hono<CreatorSessionEnv>();

  voiceProviders.get("/voice-providers/elevenlabs/voices", async (context) => {
    try {
      return context.json({ voices: await dependencies.elevenLabsVoiceProvider.listVoices() });
    } catch (error) {
      if (error instanceof ElevenLabsProviderUnavailableError) {
        return context.json(serviceUnavailableError("ElevenLabs is not configured"), 503);
      }

      if (error instanceof ElevenLabsProviderTimeoutError) {
        return context.json(badGatewayError("ElevenLabs provider timed out"), 502);
      }

      if (error instanceof ElevenLabsProviderError) {
        return context.json(badGatewayError("ElevenLabs provider failed"), 502);
      }

      throw error;
    }
  });

  return voiceProviders;
}
