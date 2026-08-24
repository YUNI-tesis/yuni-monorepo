import { jwtVerify, SignJWT } from "jose";
import { authConfig, serverConfig } from "@yuni/config";
import {
  PublicIdentityTokenClaimsSchema,
  PublicSessionTokenClaimsSchema,
  type PublicIdentityTokenClaims,
  type PublicSessionTokenClaims,
} from "@yuni/domain";

const encoder = new TextEncoder();

function getSecretKey() {
  if (serverConfig.appEnv === "production" && authConfig.secret === "dev-change-me") {
    throw new Error("AUTH_SECRET must be configured for production");
  }
  return encoder.encode(authConfig.secret);
}

export type PublicTokenService = ReturnType<typeof createPublicTokenService>;

export function createPublicTokenService() {
  return {
    async createIdentityToken(claims: Omit<PublicIdentityTokenClaims, "type">, maxAgeSeconds = 600) {
      const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
      const token = await new SignJWT({ ...claims, type: "public_identity" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(getSecretKey());
      return { token, expiresAt };
    },

    async verifyIdentityToken(token: string) {
      try {
        const { payload } = await jwtVerify(token, getSecretKey());
        const parsed = PublicIdentityTokenClaimsSchema.safeParse({
          type: payload.type,
          slug: payload.slug,
          email: payload.email,
          consentedAt: payload.consentedAt,
        });
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },

    async createSessionToken(
      sessionId: string,
      claims: Omit<PublicSessionTokenClaims, "type">,
      maxAgeSeconds: number
    ) {
      const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
      const token = await new SignJWT({ ...claims, type: "public_session" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(sessionId)
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(getSecretKey());
      return { token, expiresAt };
    },

    async verifySessionToken(token: string) {
      try {
        const { payload } = await jwtVerify(token, getSecretKey());
        const parsed = PublicSessionTokenClaimsSchema.safeParse({
          type: payload.type,
          shareLinkId: payload.shareLinkId,
        });
        if (!parsed.success || !payload.sub) return null;
        return { sessionId: payload.sub, ...parsed.data };
      } catch {
        return null;
      }
    },
  };
}
