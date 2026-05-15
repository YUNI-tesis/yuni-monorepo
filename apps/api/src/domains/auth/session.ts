import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import { authConfig, serverConfig } from "@yuni/config";
import type { PublicUser } from "./repository";

export const SESSION_COOKIE_NAME = "yuni_session";

type SessionUser = Pick<PublicUser, "id" | "email" | "name">;

const encoder = new TextEncoder();

function getSecretKey() {
  if (serverConfig.appEnv === "production" && authConfig.secret === "dev-change-me") {
    throw new Error("AUTH_SECRET must be configured for production");
  }

  return encoder.encode(authConfig.secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${authConfig.sessionMaxAgeSeconds}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());

    if (!payload.sub) {
      return null;
    }

    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function getSessionToken(context: Context): string | undefined {
  return getCookie(context, SESSION_COOKIE_NAME);
}

export function setSessionCookie(context: Context, token: string) {
  setCookie(context, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: authConfig.cookieSecure,
    sameSite: "Lax",
    path: "/",
    maxAge: authConfig.sessionMaxAgeSeconds,
  });
}

export function clearSessionCookie(context: Context) {
  deleteCookie(context, SESSION_COOKIE_NAME, {
    path: "/",
  });
}
