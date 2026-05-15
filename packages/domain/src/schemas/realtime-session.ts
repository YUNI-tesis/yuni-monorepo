import { z } from "zod";
import { YuniIdSchema } from "../ids";

export const CreateRealtimeSessionInputSchema = z.strictObject({
  avatarAgentId: YuniIdSchema,
  conversationId: YuniIdSchema.optional(),
  publicSessionId: YuniIdSchema.optional(),
});

export type CreateRealtimeSessionInput = z.infer<typeof CreateRealtimeSessionInputSchema>;
