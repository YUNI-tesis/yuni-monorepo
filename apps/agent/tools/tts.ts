import OpenAI from "openai";

/**
 * Text-to-speech wrapper using OpenAI TTS API.
 * Designed to be easily swapped for ElevenLabs later.
 */
export async function synthesizeSpeech(
  text: string,
  apiKey: string,
  options?: {
    voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
    speed?: number;
  }
): Promise<Buffer> {
  const openai = new OpenAI({ apiKey });
  
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: options?.voice || "alloy",
    input: text,
    speed: options?.speed || 1.0,
  });
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

