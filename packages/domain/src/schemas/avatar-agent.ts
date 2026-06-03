import { z } from "zod";
import { AvatarStatusSchema } from "../enums";

export const VoiceConfigSchema = z.strictObject({
  provider: z.literal("openai"),
  voiceId: z.string().min(1),
  displayName: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  speakingRate: z.number().positive().default(1),
});

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

export const LiveAvatarConfigSchema = z.strictObject({
  provider: z.literal("liveavatar"),
  avatarId: z.string().min(1),
  displayName: z.string().trim().min(1).optional(),
  thumbnailUrl: z.url().nullable().optional(),
  mode: z.string().trim().min(1),
  sandbox: z.boolean(),
});

export type LiveAvatarConfig = z.infer<typeof LiveAvatarConfigSchema>;

const AvatarAgentEditableFieldsSchema = z.strictObject({
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
  instructions: z.string().trim().min(1),
  context: z.string().trim().default(""),
  voiceConfig: VoiceConfigSchema,
  liveAvatarConfig: LiveAvatarConfigSchema,
});

export const CreateAvatarAgentInputSchema = AvatarAgentEditableFieldsSchema.extend({
  status: AvatarStatusSchema.default("draft"),
});

export type CreateAvatarAgentInput = z.infer<typeof CreateAvatarAgentInputSchema>;

export const UpdateAvatarAgentInputSchema = z.strictObject({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  instructions: z.string().trim().min(1).optional(),
  context: z.string().trim().optional(),
  voiceConfig: VoiceConfigSchema.optional(),
  liveAvatarConfig: LiveAvatarConfigSchema.optional(),
  status: AvatarStatusSchema.optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  "At least one avatar field must be provided"
);

export type UpdateAvatarAgentInput = z.infer<typeof UpdateAvatarAgentInputSchema>;
