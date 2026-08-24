import { ConfigError } from "./errors";
import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type AuthConfig = {
  secret: string;
  sessionMaxAgeSeconds: number;
  cookieSecure: boolean;
};

export function createAuthConfig(env: RawEnv): AuthConfig {
  return {
    secret: env.AUTH_SECRET ?? "dev-change-me",
    sessionMaxAgeSeconds: env.AUTH_SESSION_MAX_AGE_SECONDS,
    cookieSecure: env.APP_ENV === "production" ? true : (env.AUTH_COOKIE_SECURE ?? false),
  };
}

export const authConfig = createAuthConfig(rawEnv);

export function requireAuthConfig(config: AuthConfig = authConfig): AuthConfig {
  if (!config.secret || config.secret === "dev-change-me") {
    throw new ConfigError("Auth secret is not configured", ["AUTH_SECRET is required"]);
  }

  return config;
}
