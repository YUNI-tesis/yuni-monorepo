export type Agent = {
  id: string;
  name: string;
  description: string; // max 500 chars
  systemPrompt: string; // strict role/rules
  context: string; // knowledge provided by user
  toolsAllowed: ("none" | "basic")[];
  voice?: {
    provider: "openai" | "elevenlabs";
    voiceId?: string; // placeholder
    speakingRate?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ConversationState = {
  id: string;
  agentId: string;
  mode: "text" | "voice";
  messages: ChatMessage[];
  transcripts?: Array<{
    id: string;
    userAudioRef?: string; // placeholder for future storage
    transcript: string;
    createdAt: string;
  }>;
  cost: { tokensIn: number; tokensOut: number; usd: number };
  createdAt: string;
  updatedAt: string;
};

