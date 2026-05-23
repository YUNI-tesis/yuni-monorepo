import { describe, expect, it } from "vitest";
import { ConfigError } from "./errors";
import { createAuthConfig, requireAuthConfig } from "./auth";
import { createClientEnv } from "./client";
import { createDatabaseConfig } from "./database";
import { parseRawEnv } from "./env";
import { createLiveAvatarConfig } from "./live-avatar";
import { createOpenAiConfig, requireOpenAiConfig } from "./openai";
import { createPricingConfig } from "./pricing";
import { createRateLimitConfig } from "./rate-limits";

const productionEnv = {
  APP_ENV: "production",
  DATABASE_URL: "postgresql://yuni:yuni@localhost:5432/yuni_dev?schema=public",
  AUTH_SECRET: "production-secret",
  OPENAI_API_KEY: "openai-key",
  LIVEAVATAR_API_KEY: "liveavatar-key",
  LIVEAVATAR_BASE_URL: "https://api.liveavatar.example",
  LIVEAVATAR_SANDBOX: "true",
  LIVEAVATAR_MODE: "lite",
  LIVEAVATAR_REQUEST_TIMEOUT_MS: "10000",
  S3_BUCKET: "yuni",
  S3_ACCESS_KEY_ID: "access-key",
  S3_SECRET_ACCESS_KEY: "secret-key",
} satisfies Record<string, string>;

function withoutKey<T extends Record<string, string>, K extends keyof T>(input: T, key: K): Omit<T, K> {
  const copy = { ...input };
  delete copy[key];
  return copy;
}

describe("@yuni/config", () => {
  it("validates a minimal development env", () => {
    const env = parseRawEnv({});

    expect(env.APP_ENV).toBe("development");
    expect(env.API_PORT).toBe(4000);
    expect(env.LIVEAVATAR_SANDBOX).toBe(true);
    expect(env.LIVEAVATAR_MODE).toBe("lite");
  });

  it("validates a complete production env", () => {
    const env = parseRawEnv(productionEnv);

    expect(env.APP_ENV).toBe("production");
    expect(env.OPENAI_API_KEY).toBe("openai-key");
  });

  it("fails when DATABASE_URL is missing in production", () => {
    const envWithoutDatabase = withoutKey(productionEnv, "DATABASE_URL");

    expect(() => parseRawEnv(envWithoutDatabase)).toThrow(ConfigError);
  });

  it("fails when AUTH_SECRET is missing in production", () => {
    const envWithoutAuth = withoutKey(productionEnv, "AUTH_SECRET");

    expect(() => parseRawEnv(envWithoutAuth)).toThrow(ConfigError);
  });

  it("fails when requiring OpenAI without an API key", () => {
    const env = parseRawEnv({});
    const config = createOpenAiConfig(env);

    expect(() => requireOpenAiConfig(config)).toThrow(ConfigError);
  });

  it("accepts configured Live Avatar mode, sandbox and timeout", () => {
    const env = parseRawEnv({
      LIVEAVATAR_MODE: "provider-specific-mode",
      LIVEAVATAR_SANDBOX: "false",
      LIVEAVATAR_REQUEST_TIMEOUT_MS: "15000",
    });
    const config = createLiveAvatarConfig(env);

    expect(config.mode).toBe("provider-specific-mode");
    expect(config.sandbox).toBe(false);
    expect(config.requestTimeoutMs).toBe(15000);
  });

  it("does not expose secrets in client env", () => {
    const env = parseRawEnv(productionEnv);
    const clientEnv = createClientEnv(env);

    expect(Object.keys(clientEnv)).toEqual([
      "NEXT_PUBLIC_APP_NAME",
      "NEXT_PUBLIC_WEB_URL",
      "NEXT_PUBLIC_API_URL",
      "NEXT_PUBLIC_REALTIME_URL",
    ]);
  });

  it("applies rate limit defaults", () => {
    const env = parseRawEnv({});
    const config = createRateLimitConfig(env);

    expect(config.publicSessionMaxMinutes).toBe(5);
    expect(config.publicSessionMaxMessages).toBe(20);
  });

  it("applies pricing defaults", () => {
    const env = parseRawEnv({});
    const config = createPricingConfig(env);

    expect(config.currency).toBe("USD");
    expect(config.openAiInputUsdPer1MTokens).toBe(0.15);
    expect(config.openAiOutputUsdPer1MTokens).toBe(0.6);
  });

  it("coerces numeric values from strings", () => {
    const env = parseRawEnv({
      API_PORT: "4100",
      PUBLIC_SESSION_MAX_MESSAGES: "12",
      PRICING_VOICE_USD_PER_MINUTE: "0.03",
    });

    expect(env.API_PORT).toBe(4100);
    expect(env.PUBLIC_SESSION_MAX_MESSAGES).toBe(12);
    expect(env.PRICING_VOICE_USD_PER_MINUTE).toBe(0.03);
  });

  it("rejects invalid URLs", () => {
    expect(() => parseRawEnv({ NEXT_PUBLIC_API_URL: "not-a-url" })).toThrow(ConfigError);
  });

  it("uses safe development defaults for optional service configs", () => {
    const env = parseRawEnv({});
    const database = createDatabaseConfig(env);
    const auth = createAuthConfig(env);
    const liveAvatar = createLiveAvatarConfig(env);

    expect(database.url).toContain("yuni_dev");
    expect(auth.secret).toBe("dev-change-me");
    expect(auth.cookieSecure).toBe(false);
    expect(liveAvatar.mode).toBe("lite");
  });

  it("requires a non-default auth secret when explicitly requested", () => {
    const env = parseRawEnv({});
    const auth = createAuthConfig(env);

    expect(() => requireAuthConfig(auth)).toThrow(ConfigError);
  });
});
