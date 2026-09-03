import { z } from "zod";
import { AccessGrantEmailSchema } from "./access-grant";

export const GroupInteractionAvailabilitySchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ready"),
    readyMembers: z.number().int().nonnegative(),
    totalMembers: z.number().int().nonnegative(),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    reason: z.enum(["preparing", "inactive_member", "provider_error", "invalid_roster"]),
    readyMembers: z.number().int().nonnegative(),
    totalMembers: z.number().int().nonnegative(),
  }),
]);

export type GroupInteractionAvailability = z.infer<typeof GroupInteractionAvailabilitySchema>;

export const GroupSharingEligibilitySchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("eligible") }),
  z.strictObject({
    status: z.literal("blocked"),
    reason: z.literal("contains_non_owned_members"),
  }),
]);

export type GroupSharingEligibility = z.infer<typeof GroupSharingEligibilitySchema>;

export const GroupConsentSchema = z.strictObject({
  scopeId: z.string().trim().min(1),
  version: z.string().trim().min(1),
});

export type GroupConsent = z.infer<typeof GroupConsentSchema>;

// Group links carry both an explicit acceptance and an opaque consent version.
export const IdentifyPublicGroupLinkInputSchema = z.strictObject({
  email: AccessGrantEmailSchema,
  consent: z.literal(true),
  consentVersion: z.string().trim().min(1),
  scopeId: z.string().trim().min(1),
});

export type IdentifyPublicGroupLinkInput = z.infer<typeof IdentifyPublicGroupLinkInputSchema>;

export const PublicGroupIdentityTokenClaimsSchema = z.strictObject({
  type: z.literal("public_group_identity"),
  slug: z.string().trim().min(1),
  email: AccessGrantEmailSchema,
  consentedAt: z.string().datetime(),
  scopeId: z.string().trim().min(1),
  consentVersion: z.string().trim().min(1),
});

export type PublicGroupIdentityTokenClaims = z.infer<typeof PublicGroupIdentityTokenClaimsSchema>;

export const PublicGroupSessionTokenClaimsSchema = z.strictObject({
  type: z.literal("public_group_session"),
  groupPublicSessionId: z.string().trim().min(1),
});

export type PublicGroupSessionTokenClaims = z.infer<typeof PublicGroupSessionTokenClaimsSchema>;

export function groupConsentScopeId(kind: "access-grant" | "share-link", targetId: string) {
  return `group-${kind}:${targetId}`;
}
