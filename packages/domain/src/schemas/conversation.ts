import { z } from "zod";
import { ConversationModeSchema } from "../enums";
import { YuniIdSchema } from "../ids";

export const CreatePrivateConversationInputSchema = z.strictObject({
  avatarAgentId: YuniIdSchema,
  mode: ConversationModeSchema.default("text"),
});

export type CreatePrivateConversationInput = z.infer<typeof CreatePrivateConversationInputSchema>;

export const CreateConversationInputSchema = z.strictObject({
  mode: ConversationModeSchema.default("text"),
});

export type CreateConversationInput = z.infer<typeof CreateConversationInputSchema>;

export const CreatePublicConversationInputSchema = z.strictObject({
  shareLinkId: YuniIdSchema,
  avatarAgentId: YuniIdSchema,
  publicSessionId: YuniIdSchema,
  mode: ConversationModeSchema.default("text"),
});

export type CreatePublicConversationInput = z.infer<typeof CreatePublicConversationInputSchema>;
