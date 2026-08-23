import { z } from "zod";
import { YuniIdSchema } from "../ids";

export const AvatarGroupMemberIdsSchema = z
  .array(YuniIdSchema)
  .min(2, "Seleccioná al menos dos avatares")
  .max(3, "Podés seleccionar hasta tres avatares")
  .refine((ids) => new Set(ids).size === ids.length, "No podés repetir avatares");

export const CreateAvatarGroupInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  avatarIds: AvatarGroupMemberIdsSchema,
});

export const UpdateAvatarGroupInputSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    avatarIds: AvatarGroupMemberIdsSchema.optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.avatarIds !== undefined,
    "No hay cambios para guardar"
  );

export const GroupVoiceTurnInputSchema = z.strictObject({
  sourceEventId: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(8_000),
});

const GroupProviderEventBase = {
  sourceEventId: z.string().trim().min(1).max(160),
  avatarId: YuniIdSchema,
  content: z.string().trim().max(8_000).optional(),
};

export const GroupProviderEventInputSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...GroupProviderEventBase,
    type: z.literal("speak_started"),
    turnId: YuniIdSchema.nullable(),
  }),
  z.strictObject({
    ...GroupProviderEventBase,
    type: z.literal("agent_response"),
    turnId: YuniIdSchema,
  }),
  z.strictObject({
    ...GroupProviderEventBase,
    type: z.literal("agent_response_correction"),
    turnId: YuniIdSchema,
  }),
  z.strictObject({
    ...GroupProviderEventBase,
    type: z.literal("speak_ended"),
    turnId: YuniIdSchema,
  }),
  z.strictObject({
    ...GroupProviderEventBase,
    type: z.literal("interruption"),
    turnId: YuniIdSchema,
  }),
]);

export const InterruptGroupVoiceSessionInputSchema = z.strictObject({
  reason: z.enum(["user", "unauthorized_audio", "timeout", "participant_error"]).default("user"),
  expectedAvatarId: YuniIdSchema.optional(),
  expectedTurnId: YuniIdSchema.optional(),
});

export const GroupVoiceParticipantFailureInputSchema = z.strictObject({
  sourceEventId: z.string().trim().min(1).max(160),
  reason: z.enum(["session_stopped", "stream_error"]),
  participantAttemptId: YuniIdSchema,
  expectedTurnId: YuniIdSchema.optional(),
});

export const EndGroupVoiceSessionInputSchema = z.strictObject({
  reason: z.enum(["user", "timeout", "no_participants", "unload"]).default("user"),
});

export type CreateAvatarGroupInput = z.infer<typeof CreateAvatarGroupInputSchema>;
export type UpdateAvatarGroupInput = z.infer<typeof UpdateAvatarGroupInputSchema>;
export type GroupVoiceTurnInput = z.infer<typeof GroupVoiceTurnInputSchema>;
export type GroupProviderEventInput = z.infer<typeof GroupProviderEventInputSchema>;
export type InterruptGroupVoiceSessionInput = z.infer<typeof InterruptGroupVoiceSessionInputSchema>;
export type GroupVoiceParticipantFailureInput = z.infer<typeof GroupVoiceParticipantFailureInputSchema>;
export type EndGroupVoiceSessionInput = z.infer<typeof EndGroupVoiceSessionInputSchema>;
