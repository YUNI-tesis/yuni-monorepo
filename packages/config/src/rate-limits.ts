import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type RateLimitConfig = {
  publicSessionMaxMinutes: number;
  publicSessionMaxMessages: number;
  publicMessagesPerMinute: number;
  privateMessagesPerMinute: number;
  maxPublicSessionsPerAvatarPerHour: number;
  maxPublicSessionsPerIpPerHour: number;
};

export function createRateLimitConfig(env: RawEnv): RateLimitConfig {
  return {
    publicSessionMaxMinutes: env.PUBLIC_SESSION_MAX_MINUTES,
    publicSessionMaxMessages: env.PUBLIC_SESSION_MAX_MESSAGES,
    publicMessagesPerMinute: env.PUBLIC_MESSAGES_PER_MINUTE,
    privateMessagesPerMinute: env.PRIVATE_MESSAGES_PER_MINUTE,
    maxPublicSessionsPerAvatarPerHour: env.MAX_PUBLIC_SESSIONS_PER_AVATAR_PER_HOUR,
    maxPublicSessionsPerIpPerHour: env.MAX_PUBLIC_SESSIONS_PER_IP_PER_HOUR,
  };
}

export const rateLimitConfig = createRateLimitConfig(rawEnv);
