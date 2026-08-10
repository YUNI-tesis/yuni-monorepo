import { z } from "zod";
import { AccessGrantStatusSchema } from "../enums";

export const AccessGrantEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

export const CreateAccessGrantInputSchema = z.strictObject({
  email: AccessGrantEmailSchema,
});

export type CreateAccessGrantInput = z.infer<typeof CreateAccessGrantInputSchema>;

export const UpdateAccessGrantInputSchema = z.strictObject({
  status: AccessGrantStatusSchema,
});

export type UpdateAccessGrantInput = z.infer<typeof UpdateAccessGrantInputSchema>;
