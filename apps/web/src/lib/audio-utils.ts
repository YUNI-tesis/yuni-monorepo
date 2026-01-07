import { OpenAI } from "openai";

/**
 * Speech-to-text using OpenAI Whisper API.
 */
export async function transcribeAudio(audioBuffer: Buffer, apiKey: string): Promise<string> {
  const openai = new OpenAI({ apiKey });
  const file = new File([new Uint8Array(audioBuffer)], "audio.webm", { type: "audio/webm" });
  const transcription = await openai.audio.transcriptions.create({
    file: file,
    model: "whisper-1",
  });
  return transcription.text;
}

/**
 * Text-to-speech using OpenAI TTS API.
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

