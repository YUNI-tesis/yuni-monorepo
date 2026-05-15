import { z } from "zod";
import { JobTypeSchema } from "../enums";
import { YuniIdSchema } from "../ids";

export const CreateJobInputSchema = z.strictObject({
  ownerId: YuniIdSchema.optional(),
  avatarAgentId: YuniIdSchema.optional(),
  type: JobTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  maxAttempts: z.number().int().positive().default(3),
  runAfter: z.date().optional(),
});

export type CreateJobInput = z.infer<typeof CreateJobInputSchema>;
