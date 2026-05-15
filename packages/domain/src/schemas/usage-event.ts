import { z } from "zod";
import { UsageOperationSchema } from "../enums";
import { YuniIdSchema } from "../ids";

export const CreateUsageEventInputSchema = z.strictObject({
  ownerId: YuniIdSchema.optional(),
  avatarAgentId: YuniIdSchema,
  conversationId: YuniIdSchema.optional(),
  publicSessionId: YuniIdSchema.optional(),
  shareLinkId: YuniIdSchema.optional(),
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1).optional(),
  operation: UsageOperationSchema,
  tokensIn: z.number().int().nonnegative().default(0),
  tokensOut: z.number().int().nonnegative().default(0),
  audioSeconds: z.number().int().nonnegative().default(0),
  costUsd: z.number().nonnegative().default(0),
});

export type CreateUsageEventInput = z.infer<typeof CreateUsageEventInputSchema>;
