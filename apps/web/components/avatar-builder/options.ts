export type VoiceOption = {
  id: string;
  name: string;
  description: string;
  provider: "openai";
};

export const voiceOptions: VoiceOption[] = [
  {
    id: "alloy",
    name: "Alloy",
    description: "Voz equilibrada y natural para conversaciones generales.",
    provider: "openai",
  },
  {
    id: "verse",
    name: "Verse",
    description: "Voz calida con un ritmo mas expresivo.",
    provider: "openai",
  },
  {
    id: "nova",
    name: "Nova",
    description: "Voz clara y brillante para guias y explicaciones.",
    provider: "openai",
  },
];
