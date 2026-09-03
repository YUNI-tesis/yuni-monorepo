import { Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient;

export type GroupPublicRateLimitBucketRule = {
  keyHash: string;
  limit: number;
  windowStartedAt: Date;
  expiresAt: Date;
};

export type GroupPublicRateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Persists only already-HMACed bucket keys. Advisory locks serialize both the
 * first insert and later increments across API replicas. All rules are checked
 * before any counter is written, so a rejected request consumes no bucket.
 */
export function createGroupPublicRateLimitRepository(db: Db) {
  return {
    async consume(
      rules: GroupPublicRateLimitBucketRule[],
      evaluatedAt = new Date()
    ): Promise<GroupPublicRateLimitResult> {
      const buckets = normalizeRules(rules);
      if (buckets.length === 0) return { allowed: true };

      return db.$transaction(async (transaction) => {
        // Every caller acquires these transaction-scoped locks in the same
        // order, including when multiple rules share a request. PostgreSQL's
        // lock function returns void, so cast it to text before Prisma decodes it.
        for (const bucket of buckets) {
          await transaction.$queryRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${bucket.keyHash}, 0))::text AS "lock"`
          );
        }

        const current = await transaction.groupPublicRateLimitBucket.findMany({
          where: { keyHash: { in: buckets.map((bucket) => bucket.keyHash) } },
          select: { keyHash: true, requestCount: true, expiresAt: true },
        });
        const currentByKey = new Map(current.map((bucket) => [bucket.keyHash, bucket]));
        const blocked = buckets.flatMap((bucket) => {
          const value = currentByKey.get(bucket.keyHash);
          return value && value.requestCount >= bucket.limit
            ? [Math.max(1, Math.ceil((value.expiresAt.getTime() - evaluatedAt.getTime()) / 1000))]
            : [];
        });

        if (blocked.length > 0) {
          return {
            allowed: false as const,
            retryAfterSeconds: Math.max(...blocked),
          };
        }

        for (const bucket of buckets) {
          await transaction.groupPublicRateLimitBucket.upsert({
            where: { keyHash: bucket.keyHash },
            create: {
              keyHash: bucket.keyHash,
              requestCount: 1,
              windowStartedAt: bucket.windowStartedAt,
              expiresAt: bucket.expiresAt,
            },
            update: { requestCount: { increment: 1 } },
          });
        }

        return { allowed: true as const };
      });
    },

    cleanupExpired(evaluatedAt = new Date()) {
      return db.groupPublicRateLimitBucket.deleteMany({
        where: { expiresAt: { lte: evaluatedAt } },
      });
    },
  };
}

function normalizeRules(rules: GroupPublicRateLimitBucketRule[]) {
  const buckets = new Map<string, GroupPublicRateLimitBucketRule>();
  for (const rule of rules) {
    if (!rule.keyHash || !Number.isSafeInteger(rule.limit) || rule.limit < 1) {
      throw new Error("Invalid durable public group rate-limit rule");
    }
    if (rule.expiresAt.getTime() <= rule.windowStartedAt.getTime()) {
      throw new Error("Invalid durable public group rate-limit window");
    }

    const existing = buckets.get(rule.keyHash);
    if (!existing) {
      buckets.set(rule.keyHash, rule);
      continue;
    }
    buckets.set(rule.keyHash, { ...existing, limit: Math.min(existing.limit, rule.limit) });
  }
  return [...buckets.values()].sort((left, right) => left.keyHash.localeCompare(right.keyHash));
}
