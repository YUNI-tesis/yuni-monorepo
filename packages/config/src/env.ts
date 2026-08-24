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

  PORT: z.coerce.number().int().positive().optional(),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),

  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("YUNI"),
  NEXT_PUBLIC_WEB_URL: z.url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1).optional(),

  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(2592000),
  AUTH_COOKIE_SECURE: BooleanStringSchema.optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_GROUP_ROUTER_MODEL: z.string().trim().min(1).default("gpt-5.4-nano"),
  OPENAI_GROUP_ROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  OPENAI_EMBEDDINGS_MODEL: z.string().min(1).default("text-embedding-3-small"),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_BASE_URL: z.url().default("https://api.elevenlabs.io"),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),
  ELEVENLABS_AGENT_LLM_MODEL: z.string().trim().min(1).default("gpt-4o-mini"),
  ELEVENLABS_AGENT_TTS_MODEL: z.string().trim().min(1).default("eleven_v3"),
  ELEVENLABS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  ELEVENLABS_RAG_MAX_DOCUMENTS_LENGTH: z.coerce.number().int().positive().default(10000),

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
  S3_FORCE_PATH_STYLE: BooleanStringSchema.optional(),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),

  MAX_EXTERNAL_SESSION_MINUTES: z.coerce.number().int().positive().max(60).default(60),
  PUBLIC_SESSION_MAX_MESSAGES: z.coerce.number().int().positive().max(200).default(200),
  PUBLIC_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(10),
  PRIVATE_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(30),
  MAX_EXTERNAL_CONCURRENT_PER_AVATAR: z.coerce.number().int().positive().default(20),
  MAX_EXTERNAL_CONCURRENT_PER_PARTICIPANT: z.coerce.number().int().positive().default(1),
  MAX_PUBLIC_IDENTIFICATIONS_PER_IP_LINK_15_MINUTES: z.coerce.number().int().positive().default(60),
  MAX_PUBLIC_IDENTIFICATIONS_PER_EMAIL_LINK_15_MINUTES: z.coerce.number().int().positive().default(10),
  MAX_EXTERNAL_SESSION_STARTS_PER_IP_TARGET_HOUR: z.coerce.number().int().positive().default(60),
  MAX_EXTERNAL_SESSION_STARTS_PER_PARTICIPANT_TARGET_HOUR: z.coerce.number().int().positive().default(20),
  MAX_PUBLIC_SESSION_STARTS_PER_LINK_HOUR: z.coerce.number().int().positive().default(120),
  MAX_EXTERNAL_SESSION_STARTS_PER_AVATAR_HOUR: z.coerce.number().int().positive().default(200),

  PRICING_OPENAI_INPUT_USD_PER_1M_TOKENS: z.coerce.number().nonnegative().default(0.15),
  PRICING_OPENAI_OUTPUT_USD_PER_1M_TOKENS: z.coerce.number().nonnegative().default(0.6),
  PRICING_VOICE_USD_PER_MINUTE: z.coerce.number().nonnegative().default(0),
  PRICING_LIVEAVATAR_USD_PER_MINUTE: z.coerce.number().nonnegative().default(0),
});

export type RawEnv = z.infer<typeof RawEnvSchema>;

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`);
}

export function parseRawEnv(input: NodeJS.ProcessEnv | Record<string, string | undefined>): RawEnv {
  const parsed = RawEnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError("Invalid environment configuration", formatIssues(parsed.error));
  }

  return parsed.data;
}

const requiredProductionServerKeys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "ELEVENLABS_API_KEY",
  "LIVEAVATAR_API_KEY",
  "LIVEAVATAR_ELEVENLABS_SECRET_ID",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const satisfies ReadonlyArray<keyof RawEnv>;

export function requireProductionServerEnv(rawEnv: RawEnv): RawEnv {
  if (rawEnv.APP_ENV !== "production") return rawEnv;

  const issues: string[] = [];
  for (const key of requiredProductionServerKeys) {
    if (!rawEnv[key]) issues.push(`${key} is required when APP_ENV=production`);
  }

  if (issues.length > 0) {
    throw new ConfigError("Invalid environment configuration", issues);
  }

  return rawEnv;
}

export const rawEnv = parseRawEnv(process.env);
