import { jwtVerify, SignJWT } from "jose";
import { authConfig, serverConfig } from "@yuni/config";
import {
  PublicGroupIdentityTokenClaimsSchema,
  PublicGroupSessionTokenClaimsSchema,
  type PublicGroupIdentityTokenClaims,
  type PublicGroupSessionTokenClaims,
} from "@yuni/domain";

const encoder = new TextEncoder();

function secretKey() {
  if (serverConfig.appEnv === "production" && authConfig.secret === "dev-change-me") {
    throw new Error("AUTH_SECRET must be configured for production");
  }
  return encoder.encode(authConfig.secret);
}

export function createPublicGroupTokenService() {
  return {
    async createIdentityToken(claims: Omit<PublicGroupIdentityTokenClaims, "type">, maxAgeSeconds = 600) {
      const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
      const token = await new SignJWT({ ...claims, type: "public_group_identity" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(secretKey());
      return { token, expiresAt };
    },

    async verifyIdentityToken(token: string) {
      try {
        const { payload } = await jwtVerify(token, secretKey());
        const parsed = PublicGroupIdentityTokenClaimsSchema.safeParse({
          type: payload.type,
          slug: payload.slug,
          email: payload.email,
          consentedAt: payload.consentedAt,
          scopeId: payload.scopeId,
          consentVersion: payload.consentVersion,
        });
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },

    async createSessionToken(
      voiceSessionId: string,
      claims: Omit<PublicGroupSessionTokenClaims, "type">,
      maxAgeSeconds: number
    ) {
      const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
      const token = await new SignJWT({ ...claims, type: "public_group_session" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(voiceSessionId)
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(secretKey());
      return { token, expiresAt };
    },

    async verifySessionToken(token: string) {
      try {
        const { payload } = await jwtVerify(token, secretKey());
        const parsed = PublicGroupSessionTokenClaimsSchema.safeParse({
          type: payload.type,
          groupPublicSessionId: payload.groupPublicSessionId,
        });
        if (!parsed.success || !payload.sub) return null;
        return { voiceSessionId: payload.sub, ...parsed.data };
      } catch {
        return null;
      }
    },
  };
}

export type PublicGroupTokenService = ReturnType<typeof createPublicGroupTokenService>;
