import { Hono, type Context } from "hono";
import {
  ElevenLabsProviderError,
  ElevenLabsProviderTimeoutError,
  ElevenLabsProviderUnavailableError,
  type ElevenLabsAgentProvider,
} from "@yuni/voice";
import { badGatewayError, serviceUnavailableError, unauthorizedError } from "../../utils/errors";
import { getSessionToken, verifySessionToken } from "../auth/session";

export type VoiceProvidersControllerDependencies = {
  elevenLabsVoiceProvider: Pick<ElevenLabsAgentProvider, "listVoices">;
};

async function getCurrentSession(context: Context) {
  const token = getSessionToken(context);

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function createVoiceProvidersController(dependencies: VoiceProvidersControllerDependencies) {
  const voiceProviders = new Hono();

  voiceProviders.get("/voice-providers/elevenlabs/voices", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

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
