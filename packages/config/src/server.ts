import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type ServerEnv = {
  NODE_ENV: "development" | "test" | "production";
  APP_ENV: "development" | "test" | "staging" | "production";
  PORT?: number;
  WEB_PORT: number;
  API_PORT: number;
  WORKER_CONCURRENCY: number;
  TRUST_PROXY_HOPS: number;
};

export function createServerEnv(env: RawEnv): ServerEnv {
  return {
    NODE_ENV: env.NODE_ENV,
    APP_ENV: env.APP_ENV,
    ...(env.PORT ? { PORT: env.PORT } : {}),
    WEB_PORT: env.WEB_PORT,
    API_PORT: env.API_PORT,
    WORKER_CONCURRENCY: env.WORKER_CONCURRENCY,
    TRUST_PROXY_HOPS: env.TRUST_PROXY_HOPS,
  };
}

export const serverEnv = createServerEnv(rawEnv);

export const serverConfig = {
  nodeEnv: serverEnv.NODE_ENV,
  appEnv: serverEnv.APP_ENV,
  processPort: serverEnv.PORT,
  webPort: serverEnv.WEB_PORT,
  apiPort: serverEnv.API_PORT,
  workerConcurrency: serverEnv.WORKER_CONCURRENCY,
  trustProxyHops: serverEnv.TRUST_PROXY_HOPS,
} as const;
