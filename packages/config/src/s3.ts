import { ConfigError } from "./errors";
import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type S3Config = {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  publicBaseUrl?: string;
  forcePathStyle: boolean;
  presignTtlSeconds: number;
};

function optionalUrl(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

export function createS3Config(env: RawEnv): S3Config {
  const endpoint = optionalUrl(env.S3_ENDPOINT);
  const publicBaseUrl = optionalUrl(env.S3_PUBLIC_BASE_URL);

  return {
    region: env.S3_REGION,
    bucket: env.S3_BUCKET ?? "",
    accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    ...(endpoint ? { endpoint } : {}),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? Boolean(endpoint),
    presignTtlSeconds: env.S3_PRESIGN_TTL_SECONDS,
  };
}

export const s3Config = createS3Config(rawEnv);

export function hasS3Config(config: S3Config = s3Config): boolean {
  return config.bucket.length > 0 && config.accessKeyId.length > 0 && config.secretAccessKey.length > 0;
}

export function requireS3Config(config: S3Config = s3Config): S3Config {
  if (!hasS3Config(config)) {
    throw new ConfigError("S3 is not configured", [
      "S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required",
    ]);
  }

  return config;
}
