import { z } from "zod";
import { AvatarStatusSchema } from "../enums";

export const AvatarListScopeSchema = z.enum(["all", "owned", "shared"]);
export type AvatarListScope = z.infer<typeof AvatarListScopeSchema>;

export const VoiceConfigSchema = z.strictObject({
  provider: z.enum(["openai", "elevenlabs"]),
  voiceId: z.string().min(1),
  displayName: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  speakingRate: z.number().positive().default(1),
  conversationProfile: z.enum(["standard", "natural"]).optional(),
  conversationModel: z.string().trim().min(1).optional(),
});

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

export type NewAvatarConversationDefaults = Required<
  Pick<VoiceConfig, "conversationProfile" | "conversationModel">
>;

// Apply at creation boundaries only. Reading or editing legacy avatars must not
// silently change their conversation model or profile.
export function applyNewAvatarConversationDefaults(
  voice: VoiceConfig,
  defaults: NewAvatarConversationDefaults
): VoiceConfig {
  return {
    ...voice,
    conversationProfile: voice.conversationProfile ?? defaults.conversationProfile,
    conversationModel: voice.conversationModel ?? defaults.conversationModel,
  };
}

// Provider-confirmed state, kept separate from the editable voice configuration.
export const ProviderVoiceStateSchema = z.strictObject({
  requestedModel: z.string().min(1),
  effectiveModel: z.string().min(1),
  expressiveMode: z.boolean().nullable(),
  fallbackReason: z.string().nullable(),
  verifiedAt: z.iso.datetime().nullable(),
  profile: z.enum(["standard", "natural"]),
});

export type ProviderVoiceState = z.infer<typeof ProviderVoiceStateSchema>;

export function getVerifiedConversationProfile(state: unknown): "standard" | "natural" {
  const parsed = ProviderVoiceStateSchema.safeParse(state);
  return parsed.success && parsed.data.verifiedAt ? parsed.data.profile : "standard";
}

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
  context: z.string().trim().max(20_000).default(""),
  voiceConfig: VoiceConfigSchema,
  liveAvatarConfig: LiveAvatarConfigSchema,
});

export const CreateAvatarAgentInputSchema = AvatarAgentEditableFieldsSchema.extend({
  status: AvatarStatusSchema.default("draft"),
});

export type CreateAvatarAgentInput = z.infer<typeof CreateAvatarAgentInputSchema>;

export const UpdateAvatarAgentInputSchema = z
  .strictObject({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    instructions: z.string().trim().min(1).optional(),
    context: z.string().trim().max(20_000).optional(),
    voiceConfig: VoiceConfigSchema.optional(),
    liveAvatarConfig: LiveAvatarConfigSchema.optional(),
    status: AvatarStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one avatar field must be provided");

export type UpdateAvatarAgentInput = z.infer<typeof UpdateAvatarAgentInputSchema>;
