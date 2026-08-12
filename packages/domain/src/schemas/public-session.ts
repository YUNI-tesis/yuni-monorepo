import { z } from "zod";
import { AccessGrantEmailSchema } from "./access-grant";

export const IdentifyPublicLinkInputSchema = z.strictObject({
  email: AccessGrantEmailSchema,
  consent: z.literal(true),
});

export type IdentifyPublicLinkInput = z.infer<typeof IdentifyPublicLinkInputSchema>;

export const PUBLIC_SESSION_TRANSCRIPT_MAX_MESSAGES = 20;
export const PUBLIC_SESSION_TRANSCRIPT_MAX_CONTENT_LENGTH = 500;
export const PUBLIC_SESSION_END_BODY_MAX_BYTES = 60 * 1024;

export const PublicSessionTranscriptEntrySchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(PUBLIC_SESSION_TRANSCRIPT_MAX_CONTENT_LENGTH),
});

export const EndPublicSessionInputSchema = z.strictObject({
  transcript: z
    .array(PublicSessionTranscriptEntrySchema)
    .max(PUBLIC_SESSION_TRANSCRIPT_MAX_MESSAGES)
    .default([]),
});

export type EndPublicSessionInput = z.infer<typeof EndPublicSessionInputSchema>;

export const PublicIdentityTokenClaimsSchema = z.strictObject({
  type: z.literal("public_identity"),
  slug: z.string().trim().min(1),
  email: AccessGrantEmailSchema,
  consentedAt: z.string().datetime(),
});

export type PublicIdentityTokenClaims = z.infer<typeof PublicIdentityTokenClaimsSchema>;

export const PublicSessionTokenClaimsSchema = z.strictObject({
  type: z.literal("public_session"),
  shareLinkId: z.string().trim().min(1),
});

export type PublicSessionTokenClaims = z.infer<typeof PublicSessionTokenClaimsSchema>;
