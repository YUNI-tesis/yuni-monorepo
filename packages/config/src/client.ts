import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type ClientEnv = {
  NEXT_PUBLIC_APP_NAME: string;
  NEXT_PUBLIC_WEB_URL: string;
  NEXT_PUBLIC_API_URL: string;
  NEXT_PUBLIC_REALTIME_URL: string;
};

export function createClientEnv(env: RawEnv): ClientEnv {
  return {
    NEXT_PUBLIC_APP_NAME: env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_WEB_URL: env.NEXT_PUBLIC_WEB_URL,
    NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_REALTIME_URL: env.NEXT_PUBLIC_REALTIME_URL,
  };
}

export const clientEnv = createClientEnv(rawEnv);

export const appConfig = {
  appName: clientEnv.NEXT_PUBLIC_APP_NAME,
} as const;
