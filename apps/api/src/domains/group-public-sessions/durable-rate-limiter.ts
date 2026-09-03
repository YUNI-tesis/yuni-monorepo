import { createHmac } from "node:crypto";
import type { GroupPublicRateLimitBucketRule, GroupPublicRateLimitResult } from "@yuni/db";
import type { RateLimitRule } from "../public-sessions/rate-limiter";

type Repository = {
  consume(rules: GroupPublicRateLimitBucketRule[], evaluatedAt?: Date): Promise<GroupPublicRateLimitResult>;
  cleanupExpired(evaluatedAt?: Date): Promise<unknown>;
};

export type DurableGroupRateLimiter = {
  consume(rules: RateLimitRule[]): Promise<GroupPublicRateLimitResult>;
  cleanupExpired?(): Promise<unknown>;
};

export function createDurableGroupRateLimiter(options: {
  repository: Repository;
  secret: string;
  now?: () => number;
}): DurableGroupRateLimiter {
  const now = options.now ?? Date.now;

  return {
    consume(rules) {
      const timestamp = now();
      if (!Number.isFinite(timestamp)) throw new Error("Invalid durable public group rate-limit clock");
      const evaluatedAt = new Date(timestamp);
      const buckets = rules.map((rule) => toBucket(options.secret, rule, timestamp));
      return options.repository.consume(buckets, evaluatedAt);
    },
    cleanupExpired() {
      return options.repository.cleanupExpired(new Date(now()));
    },
  };
}

function toBucket(secret: string, rule: RateLimitRule, timestamp: number): GroupPublicRateLimitBucketRule {
  if (!Number.isSafeInteger(rule.windowMs) || rule.windowMs < 1) {
    throw new Error("Invalid durable public group rate-limit window");
  }
  const windowStartedAtMs = Math.floor(timestamp / rule.windowMs) * rule.windowMs;
  const expiresAtMs = windowStartedAtMs + rule.windowMs;
  const keyHash = createHmac("sha256", secret)
    .update(
      JSON.stringify({
        namespace: rule.namespace,
        windowMs: rule.windowMs,
        windowStartedAtMs,
        identifiers: rule.identifiers,
      })
    )
    .digest("base64url");

  return {
    keyHash,
    limit: rule.limit,
    windowStartedAt: new Date(windowStartedAtMs),
    expiresAt: new Date(expiresAtMs),
  };
}
