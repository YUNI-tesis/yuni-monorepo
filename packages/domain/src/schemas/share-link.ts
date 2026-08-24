import { z } from "zod";
import { InteractionLimitsSchema } from "./interaction-limits";

export const PublicSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const CreateShareLinkInputSchema = z.strictObject({
  slug: PublicSlugSchema,
  name: z.string().trim().min(1).max(120),
  isEnabled: z.boolean().default(true),
  limits: InteractionLimitsSchema.optional(),
});

export type CreateShareLinkInput = z.infer<typeof CreateShareLinkInputSchema>;

export const UpdateShareLinkInputSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    isEnabled: z.boolean().optional(),
    limits: InteractionLimitsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one share link field must be provided");

export type UpdateShareLinkInput = z.infer<typeof UpdateShareLinkInputSchema>;
