import type { ApiVoiceConfig } from "./api/avatar-api";

export type VoiceOption = {
  id: string;
  displayName: string;
  description: string;
  provider: ApiVoiceConfig["provider"];
  toneLabel: string;
  recommendedFor: string;
  previewUrl?: string | null;
  category?: string | null;
  labels?: Record<string, string>;
};

export const currentVoiceOptionName = "Voz actual";

export const voiceOptions: VoiceOption[] = [
  {
    id: "alloy",
    displayName: "Alloy",
    description: "Voz equilibrada y natural para conversaciones generales.",
    provider: "openai",
    toneLabel: "Natural",
    recommendedFor: "Conversaciones generales y asistentes de soporte.",
  },
  {
    id: "verse",
    displayName: "Verse",
    description: "Voz cálida con un ritmo más expresivo.",
    provider: "openai",
    toneLabel: "Expresiva",
    recommendedFor: "Demos, guías narrativas y experiencias más cercanas.",
  },
  {
    id: "nova",
    displayName: "Nova",
    description: "Voz clara y brillante para guías y explicaciones.",
    provider: "openai",
    toneLabel: "Clara",
    recommendedFor: "Educación, onboarding y respuestas paso a paso.",
  },
];

type VoiceConfigInput = {
  voiceId: string;
  selectedVoice?: VoiceOption | null | undefined;
  fallbackProvider?: ApiVoiceConfig["provider"];
  fallbackDisplayName?: string;
  fallbackDescription?: string;
};

export function createVoiceConfig({
  voiceId,
  selectedVoice,
  fallbackProvider = "elevenlabs",
  fallbackDisplayName = "",
  fallbackDescription = "",
}: VoiceConfigInput): ApiVoiceConfig {
  const isCurrentOption = selectedVoice?.displayName === currentVoiceOptionName;
  const displayName = isCurrentOption ? fallbackDisplayName : selectedVoice?.displayName ?? fallbackDisplayName;
  const description = isCurrentOption ? fallbackDescription : selectedVoice?.description ?? fallbackDescription;
  const config: ApiVoiceConfig = {
    provider: selectedVoice?.provider ?? fallbackProvider,
    voiceId,
    speakingRate: 1,
  };

  if (displayName) {
    config.displayName = displayName;
  }

  if (description) {
    config.description = description;
  }

  return config;
}
