"use client";

import { apiRequest } from "./http-client";
import type { VoiceOption } from "../voice-config";

export type ApiElevenLabsVoiceOption = VoiceOption & {
  provider: "elevenlabs";
  previewUrl: string | null;
  category: string | null;
  labels: Record<string, string>;
};

export function getElevenLabsVoiceOptions() {
  return apiRequest<{ voices: ApiElevenLabsVoiceOption[] }>("/voice-providers/elevenlabs/voices");
}
