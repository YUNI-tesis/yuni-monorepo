import { createHmac } from "node:crypto";

export type RateLimitRule = {
  namespace: string;
  identifiers: string[];
  limit: number;
  windowMs: number;
};

export type RateLimiter = {
  consume(rules: RateLimitRule[]): { allowed: true } | { allowed: false; retryAfterSeconds: number };
};

export function createInMemoryRateLimiter(options: { secret: string; now?: () => number }): RateLimiter {
  const attempts = new Map<string, { values: number[]; windowMs: number }>();
  const now = options.now ?? Date.now;
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  return {
    consume(rules) {
      const timestamp = now();
      if (timestamp - lastSweepAt >= 60_000) {
        for (const [key, bucket] of attempts) {
          const current = bucket.values.filter((value) => timestamp - value < bucket.windowMs);
          if (current.length === 0) attempts.delete(key);
          else attempts.set(key, { ...bucket, values: current });
        }
        lastSweepAt = timestamp;
      }

      const evaluated = rules.map((rule) => {
        const key = hashRule(options.secret, rule);
        const current = (attempts.get(key)?.values ?? []).filter(
          (value) => timestamp - value < rule.windowMs
        );
        return { rule, key, current };
      });

      const blockedRetrySeconds = evaluated.flatMap(({ rule, current }) =>
        current.length >= rule.limit
          ? [Math.max(1, Math.ceil((rule.windowMs - (timestamp - current[0]!)) / 1000))]
          : []
      );
      if (blockedRetrySeconds.length > 0) {
        return {
          allowed: false as const,
          retryAfterSeconds: Math.max(...blockedRetrySeconds),
        };
      }

      for (const { key, current, rule } of evaluated) {
        attempts.set(key, { values: [...current, timestamp], windowMs: rule.windowMs });
      }
      return { allowed: true as const };
    },
  };
}

function hashRule(secret: string, rule: RateLimitRule) {
  const digest = createHmac("sha256", secret)
    .update([rule.namespace, String(rule.windowMs), ...rule.identifiers].join("\u0000"))
    .digest("base64url");
  return `${rule.namespace}:${digest}`;
}
