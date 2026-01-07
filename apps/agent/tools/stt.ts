import OpenAI from "openai";

/**
 * Speech-to-text wrapper using OpenAI Whisper API.
 */
export async function transcribeAudio(audioBuffer: Buffer, apiKey: string): Promise<string> {
  const openai = new OpenAI({ apiKey });
  
  // Create a File-like object from the buffer
  const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });
  
  const transcription = await openai.audio.transcriptions.create({
    file: file,
    model: "whisper-1",
  });
  
  return transcription.text;
}

