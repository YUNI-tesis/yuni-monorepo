export type LiveAvatarOption = {
  id: string;
  name: string;
  description: string;
  provider: "liveavatar";
};

export type VoiceOption = {
  id: string;
  name: string;
  description: string;
  provider: "openai";
};

export const liveAvatarOptions: LiveAvatarOption[] = [
  {
    id: "demo-guide",
    name: "Guia cercano",
    description: "Presencia clara y amable para explicar ideas paso a paso.",
    provider: "liveavatar",
  },
  {
    id: "demo-host",
    name: "Host dinamico",
    description: "Energia mas expresiva para demos, onboarding y presentaciones.",
    provider: "liveavatar",
  },
  {
    id: "demo-advisor",
    name: "Advisor profesional",
    description: "Tono sobrio para asistencia experta y conversaciones de negocio.",
    provider: "liveavatar",
  },
];

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
