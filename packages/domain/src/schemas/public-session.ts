import { z } from "zod";
import { YuniIdSchema } from "../ids";

export const CreatePublicSessionInputSchema = z.strictObject({
  shareLinkId: YuniIdSchema,
  avatarAgentId: YuniIdSchema,
  anonymousId: z.string().min(1),
});

export type CreatePublicSessionInput = z.infer<typeof CreatePublicSessionInputSchema>;
