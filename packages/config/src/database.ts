import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type DatabaseConfig = {
  url: string;
};

export function createDatabaseConfig(env: RawEnv): DatabaseConfig {
  return {
    url: env.DATABASE_URL ?? "postgresql://yuni:yuni@localhost:5432/yuni_dev?schema=public",
  };
}

export const databaseConfig = createDatabaseConfig(rawEnv);
