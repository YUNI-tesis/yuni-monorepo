/**
 * TTS Provider Abstraction
 * Supports OpenAI TTS and ElevenLabs
 */

import OpenAI from "openai";
import { TTSOptions } from "./types";

// ============================================================================
// OpenAI TTS Provider
// ============================================================================

export class OpenAITTSProvider {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Synthesize speech using OpenAI TTS
   * Returns an async generator that yields audio chunks
   */
  async *synthesize(text: string, options?: TTSOptions): AsyncGenerator<Buffer, void, unknown> {
    const voice = (options?.voice || options?.voiceId || "alloy") as
      | "alloy"
      | "echo"
      | "fable"
      | "onyx"
      | "nova"
      | "shimmer";
    
    const speed = options?.speed || options?.speakingRate || 1.0;

    try {
      const response = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: voice,
        input: text,
        speed: speed,
        response_format: "mp3", // Can be 'mp3', 'opus', 'aac', 'flac'
      });

      // OpenAI returns the entire audio at once, but we can chunk it
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Yield in chunks for streaming effect
      const chunkSize = 4096; // 4KB chunks
      for (let i = 0; i < buffer.length; i += chunkSize) {
        yield buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
      }
    } catch (error) {
      console.error("[OpenAI TTS] Error:", error);
      throw error;
    }
  }
}

// ============================================================================
// ElevenLabs TTS Provider
// ============================================================================

export class ElevenLabsTTSProvider {
  private apiKey: string;
  private baseUrl = "https://api.elevenlabs.io/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Synthesize speech using ElevenLabs
   * Returns an async generator that yields audio chunks
   */
  async *synthesize(text: string, options?: TTSOptions): AsyncGenerator<Buffer, void, unknown> {
    const voiceId = options?.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel
    const stability = 0.5;
    const similarityBoost = 0.75;
    const speed = options?.speed || options?.speakingRate || 1.0;

    const url = `${this.baseUrl}/text-to-speech/${voiceId}/stream`;

    const requestBody = {
      text: text,
      model_id: "eleven_multilingual_v2", // Supports Spanish and other languages
      voice_settings: {
        stability: stability,
        similarity_boost: similarityBoost,
        style: 0.0,
        use_speaker_boost: true,
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error("No response body from ElevenLabs");
      }

      // Stream the response
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        yield Buffer.from(value);
      }
    } catch (error) {
      console.error("[ElevenLabs TTS] Error:", error);
      throw error;
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Array<{ voice_id: string; name: string; labels: Record<string, string> }>> {
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          "xi-api-key": this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const data = await response.json();
      return data.voices;
    } catch (error) {
      console.error("[ElevenLabs] Error fetching voices:", error);
      throw error;
    }
  }
}

// ============================================================================
// TTS Factory
// ============================================================================

export interface TTSProviderConfig {
  provider: "openai" | "elevenlabs";
  apiKey: string;
}

export type TTSProvider = OpenAITTSProvider | ElevenLabsTTSProvider;

export function createTTSProvider(config: TTSProviderConfig): TTSProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAITTSProvider(config.apiKey);
    case "elevenlabs":
      return new ElevenLabsTTSProvider(config.apiKey);
    default:
      throw new Error(`Unknown TTS provider: ${config.provider}`);
  }
}

// ============================================================================
// Helper function to synthesize with agent voice config
// ============================================================================

export async function* synthesizeWithAgentVoice(
  text: string,
  agentVoice: {
    provider: "openai" | "elevenlabs";
    voiceId?: string;
    speakingRate?: number;
  } | undefined,
  openaiApiKey: string,
  elevenlabsApiKey?: string
): AsyncGenerator<Buffer, void, unknown> {
  const provider = agentVoice?.provider || "openai";
  
  if (provider === "elevenlabs") {
    if (!elevenlabsApiKey) {
      console.warn("[TTS] ElevenLabs API key not provided, falling back to OpenAI");
      const openaiProvider = new OpenAITTSProvider(openaiApiKey);
      yield* openaiProvider.synthesize(text, {
        voiceId: agentVoice?.voiceId,
        speakingRate: agentVoice?.speakingRate,
      });
      return;
    }

    const elevenlabsProvider = new ElevenLabsTTSProvider(elevenlabsApiKey);
    yield* elevenlabsProvider.synthesize(text, {
      voiceId: agentVoice?.voiceId,
      speakingRate: agentVoice?.speakingRate,
    });
  } else {
    const openaiProvider = new OpenAITTSProvider(openaiApiKey);
    yield* openaiProvider.synthesize(text, {
      voiceId: agentVoice?.voiceId,
      speakingRate: agentVoice?.speakingRate,
    });
  }
}
