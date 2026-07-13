import { z } from "zod";
import { ConfigError } from "./errors";

const BooleanStringSchema = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),

  WEB_PORT: z.coerce.number().int().positive().default(3000),
  API_PORT: z.coerce.number().int().positive().default(4000),
  REALTIME_PORT: z.coerce.number().int().positive().default(4001),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),

  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("YUNI"),
  NEXT_PUBLIC_WEB_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:4000"),
  NEXT_PUBLIC_REALTIME_URL: z.string().min(1).default("ws://localhost:4001"),

  DATABASE_URL: z.string().min(1).optional(),

  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(2592000),
  AUTH_COOKIE_SECURE: BooleanStringSchema.optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_REALTIME_MODEL: z.string().min(1).default("gpt-4o-realtime-preview"),
  OPENAI_EMBEDDINGS_MODEL: z.string().min(1).default("text-embedding-3-small"),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_BASE_URL: z.url().default("https://api.elevenlabs.io"),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),
  ELEVENLABS_AGENT_LLM_MODEL: z.string().trim().min(1).default("gpt-4o-mini"),
  ELEVENLABS_AGENT_TTS_MODEL: z.string().trim().min(1).default("eleven_v3"),
  ELEVENLABS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  LIVEAVATAR_API_KEY: z.string().optional(),
  LIVEAVATAR_BASE_URL: z.url().default("https://api.liveavatar.com"),
  LIVEAVATAR_SANDBOX: BooleanStringSchema.default(true),
  LIVEAVATAR_MODE: z.string().trim().min(1).default("lite"),
  LIVEAVATAR_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  LIVEAVATAR_ELEVENLABS_SECRET_ID: z.string().optional(),

  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.url().optional().or(z.literal("")),
  S3_PUBLIC_BASE_URL: z.url().optional().or(z.literal("")),

  PUBLIC_SESSION_MAX_MINUTES: z.coerce.number().int().positive().default(5),
  PUBLIC_SESSION_MAX_MESSAGES: z.coerce.number().int().positive().default(20),
  PUBLIC_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(10),
  PRIVATE_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(30),
  MAX_PUBLIC_SESSIONS_PER_AVATAR_PER_HOUR: z.coerce.number().int().positive().default(50),

  PRICING_OPENAI_INPUT_USD_PER_1M_TOKENS: z.coerce.number().nonnegative().default(0.15),
  PRICING_OPENAI_OUTPUT_USD_PER_1M_TOKENS: z.coerce.number().nonnegative().default(0.6),
  PRICING_VOICE_USD_PER_MINUTE: z.coerce.number().nonnegative().default(0),
  PRICING_LIVEAVATAR_USD_PER_MINUTE: z.coerce.number().nonnegative().default(0),
});

export type RawEnv = z.infer<typeof RawEnvSchema>;

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`);
}

function requireWhenProduction(rawEnv: RawEnv, key: keyof RawEnv, issues: string[]) {
  if (rawEnv.APP_ENV === "production" && !rawEnv[key]) {
    issues.push(`${String(key)} is required when APP_ENV=production`);
  }
}

export function parseRawEnv(input: NodeJS.ProcessEnv | Record<string, string | undefined>): RawEnv {
  const parsed = RawEnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError("Invalid environment configuration", formatIssues(parsed.error));
  }

  const rawEnv = parsed.data;
  const issues: string[] = [];

  requireWhenProduction(rawEnv, "DATABASE_URL", issues);
  requireWhenProduction(rawEnv, "AUTH_SECRET", issues);
  requireWhenProduction(rawEnv, "OPENAI_API_KEY", issues);
  requireWhenProduction(rawEnv, "ELEVENLABS_API_KEY", issues);
  requireWhenProduction(rawEnv, "LIVEAVATAR_API_KEY", issues);
  requireWhenProduction(rawEnv, "LIVEAVATAR_ELEVENLABS_SECRET_ID", issues);
  requireWhenProduction(rawEnv, "S3_BUCKET", issues);
  requireWhenProduction(rawEnv, "S3_ACCESS_KEY_ID", issues);
  requireWhenProduction(rawEnv, "S3_SECRET_ACCESS_KEY", issues);

  if (issues.length > 0) {
    throw new ConfigError("Invalid environment configuration", issues);
  }

  return rawEnv;
}

export const rawEnv = parseRawEnv(process.env);
