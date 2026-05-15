import { z } from "zod";

const EmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

const PasswordSchema = z.string().min(8).max(256);

export const RegisterInputSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .transform((name) => (name === "" ? undefined : name)),
  })
  .strict();

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
  })
  .strict();

export type LoginInput = z.infer<typeof LoginInputSchema>;
