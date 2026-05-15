import { z } from "zod";
import { AvatarStatusSchema } from "../enums";

export const VoiceConfigSchema = z.strictObject({
  provider: z.enum(["openai", "elevenlabs"]),
  voiceId: z.string().min(1),
  speakingRate: z.number().positive().default(1),
});

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

export const LiveAvatarConfigSchema = z.strictObject({
  provider: z.literal("liveavatar"),
  avatarId: z.string().min(1),
  mode: z.literal("lite"),
  sandbox: z.literal(true),
});

export type LiveAvatarConfig = z.infer<typeof LiveAvatarConfigSchema>;

export const CreateAvatarAgentInputSchema = z.strictObject({
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
  instructions: z.string().trim().min(1),
  context: z.string().trim().default(""),
  voiceConfig: VoiceConfigSchema,
  liveAvatarConfig: LiveAvatarConfigSchema,
  status: AvatarStatusSchema.default("draft"),
});

export type CreateAvatarAgentInput = z.infer<typeof CreateAvatarAgentInputSchema>;

export const UpdateAvatarAgentInputSchema = CreateAvatarAgentInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one avatar field must be provided"
);

export type UpdateAvatarAgentInput = z.infer<typeof UpdateAvatarAgentInputSchema>;
