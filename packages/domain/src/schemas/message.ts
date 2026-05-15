import { z } from "zod";
import { MessageRoleSchema } from "../enums";

export const AppendMessageInputSchema = z.strictObject({
  role: MessageRoleSchema,
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AppendMessageInput = z.infer<typeof AppendMessageInputSchema>;
