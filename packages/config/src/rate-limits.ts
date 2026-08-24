import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type RateLimitConfig = {
  maxExternalSessionMinutes: number;
  publicSessionMaxMessages: number;
  publicMessagesPerMinute: number;
  privateMessagesPerMinute: number;
  maxExternalConcurrentPerAvatar: number;
  maxExternalConcurrentPerParticipant: number;
  maxPublicIdentificationsPerIpLink15Minutes: number;
  maxPublicIdentificationsPerEmailLink15Minutes: number;
  maxExternalSessionStartsPerIpTargetHour: number;
  maxExternalSessionStartsPerParticipantTargetHour: number;
  maxPublicSessionStartsPerLinkHour: number;
  maxExternalSessionStartsPerAvatarHour: number;
};

export function createRateLimitConfig(env: RawEnv): RateLimitConfig {
  return {
    maxExternalSessionMinutes: env.MAX_EXTERNAL_SESSION_MINUTES,
    publicSessionMaxMessages: env.PUBLIC_SESSION_MAX_MESSAGES,
    publicMessagesPerMinute: env.PUBLIC_MESSAGES_PER_MINUTE,
    privateMessagesPerMinute: env.PRIVATE_MESSAGES_PER_MINUTE,
    maxExternalConcurrentPerAvatar: env.MAX_EXTERNAL_CONCURRENT_PER_AVATAR,
    maxExternalConcurrentPerParticipant: env.MAX_EXTERNAL_CONCURRENT_PER_PARTICIPANT,
    maxPublicIdentificationsPerIpLink15Minutes: env.MAX_PUBLIC_IDENTIFICATIONS_PER_IP_LINK_15_MINUTES,
    maxPublicIdentificationsPerEmailLink15Minutes: env.MAX_PUBLIC_IDENTIFICATIONS_PER_EMAIL_LINK_15_MINUTES,
    maxExternalSessionStartsPerIpTargetHour: env.MAX_EXTERNAL_SESSION_STARTS_PER_IP_TARGET_HOUR,
    maxExternalSessionStartsPerParticipantTargetHour:
      env.MAX_EXTERNAL_SESSION_STARTS_PER_PARTICIPANT_TARGET_HOUR,
    maxPublicSessionStartsPerLinkHour: env.MAX_PUBLIC_SESSION_STARTS_PER_LINK_HOUR,
    maxExternalSessionStartsPerAvatarHour: env.MAX_EXTERNAL_SESSION_STARTS_PER_AVATAR_HOUR,
  };
}

export const rateLimitConfig = createRateLimitConfig(rawEnv);
