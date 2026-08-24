import { z } from "zod";
import { AccessGrantStatusSchema } from "../enums";
import { InteractionLimitsSchema } from "./interaction-limits";

export const AccessGrantEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

export const CreateAccessGrantInputSchema = z.strictObject({
  email: AccessGrantEmailSchema,
  limits: InteractionLimitsSchema.optional(),
});

export type CreateAccessGrantInput = z.infer<typeof CreateAccessGrantInputSchema>;

export const UpdateAccessGrantInputSchema = z
  .strictObject({
    status: AccessGrantStatusSchema.optional(),
    limits: InteractionLimitsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one access grant field must be provided");

export type UpdateAccessGrantInput = z.infer<typeof UpdateAccessGrantInputSchema>;
