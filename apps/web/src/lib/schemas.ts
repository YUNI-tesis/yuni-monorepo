import { z } from "zod";

// Agent schema
export const AgentSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  description: z.string().max(500, "Description must be 500 characters or less"),
  systemPrompt: z.string().min(1, "System prompt is required"),
  context: z.string(),
  toolsAllowed: z.array(z.enum(["none", "basic"])),
  voice: z
    .object({
      provider: z.enum(["openai", "elevenlabs"]),
      voiceId: z.string().optional(),
      speakingRate: z.number().optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Agent = z.infer<typeof AgentSchema>;

// ChatMessage schema
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1, "Content cannot be empty"),
  createdAt: z.string(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ConversationState schema
export const ConversationStateSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  mode: z.enum(["text", "voice"]),
  messages: z.array(ChatMessageSchema),
  transcripts: z
    .array(
      z.object({
        id: z.string(),
        userAudioRef: z.string().optional(),
        transcript: z.string(),
        createdAt: z.string(),
      })
    )
    .optional(),
  cost: z.object({
    tokensIn: z.number(),
    tokensOut: z.number(),
    usd: z.number(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ConversationState = z.infer<typeof ConversationStateSchema>;

// API request schemas
export const CreateAgentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().max(500, "Description must be 500 characters or less"),
  systemPrompt: z.string().min(1, "System prompt is required"),
  context: z.string(),
  toolsAllowed: z.array(z.enum(["none", "basic"])).default(["none"]),
  voice: z
    .object({
      provider: z.enum(["openai", "elevenlabs"]),
      voiceId: z.string().optional(),
      speakingRate: z.number().optional(),
    })
    .optional(),
});

export const UpdateAgentSchema = CreateAgentSchema.partial();

export const CreateConversationSchema = z.object({
  agentId: z.string(),
  mode: z.enum(["text", "voice"]).default("text"),
});

export const ChatRequestSchema = z.object({
  agentId: z.string(),
  conversationId: z.string(),
  message: z.string().min(1, "Message cannot be empty"),
  mode: z.enum(["text", "voice"]).default("text"),
});

export const CostRequestSchema = z.object({
  conversationId: z.string(),
});

export const TTSRequestSchema = z.object({
  text: z.string().min(1),
  voice: z.string().optional(),
});

