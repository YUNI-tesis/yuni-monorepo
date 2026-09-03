import { describe, expect, it, vi } from "vitest";
import {
  createGroupPublicRateLimitRepository,
  type GroupPublicRateLimitBucketRule,
} from "./repositories/group-public-rate-limit-repository";

const evaluatedAt = new Date("2026-08-31T12:00:00.000Z");

function rule(keyHash: string, limit: number): GroupPublicRateLimitBucketRule {
  return {
    keyHash,
    limit,
    windowStartedAt: new Date("2026-08-31T11:45:00.000Z"),
    expiresAt: new Date("2026-08-31T12:05:00.000Z"),
  };
}

function fixture(current: Array<{ keyHash: string; requestCount: number; expiresAt: Date }>) {
  const queryRaw = vi.fn(async () => [{ lock: null }]);
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  const findMany = vi.fn(async () => current);
  const upsert = vi.fn(async () => ({}));
  const transaction = {
    $queryRaw: queryRaw,
    groupPublicRateLimitBucket: { deleteMany, findMany, upsert },
  };
  const $transaction = vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
    operation(transaction)
  );
  const repository = createGroupPublicRateLimitRepository({
    $transaction,
    groupPublicRateLimitBucket: { deleteMany },
  } as never);
  return { repository, $transaction, queryRaw, deleteMany, findMany, upsert };
}

describe("group public durable rate-limit repository", () => {
  it("does not increment any rule when one bucket is blocked", async () => {
    const test = fixture([
      { keyHash: "a-bucket", requestCount: 2, expiresAt: new Date("2026-08-31T12:05:00.000Z") },
      { keyHash: "b-bucket", requestCount: 1, expiresAt: new Date("2026-08-31T12:04:00.000Z") },
    ]);

    await expect(
      test.repository.consume([rule("b-bucket", 5), rule("a-bucket", 2)], evaluatedAt)
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 300 });

    expect(test.$transaction).toHaveBeenCalledTimes(1);
    expect(test.queryRaw).toHaveBeenCalledTimes(2);
    expect(test.deleteMany).not.toHaveBeenCalled();
    expect(test.findMany).toHaveBeenCalledWith({
      where: { keyHash: { in: ["a-bucket", "b-bucket"] } },
      select: { keyHash: true, requestCount: true, expiresAt: true },
    });
    expect(test.upsert).not.toHaveBeenCalled();
  });

  it("increments every rule in the same transaction and deduplicates identical buckets", async () => {
    const test = fixture([]);

    await expect(
      test.repository.consume([rule("b-bucket", 5), rule("a-bucket", 3), rule("a-bucket", 2)], evaluatedAt)
    ).resolves.toEqual({ allowed: true });

    expect(test.queryRaw).toHaveBeenCalledTimes(2);
    expect(test.upsert).toHaveBeenCalledTimes(2);
    expect(test.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { keyHash: "a-bucket" },
        create: expect.objectContaining({ keyHash: "a-bucket", requestCount: 1 }),
        update: { requestCount: { increment: 1 } },
      })
    );
    expect(test.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { keyHash: "b-bucket" } })
    );
  });

  it("exposes durable cleanup for expired buckets", async () => {
    const test = fixture([]);

    await expect(test.repository.cleanupExpired(evaluatedAt)).resolves.toEqual({ count: 0 });
    expect(test.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: evaluatedAt } } });
  });
});
