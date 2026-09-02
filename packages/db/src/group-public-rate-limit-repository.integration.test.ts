import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createGroupPublicRateLimitRepository } from "./repositories/group-public-rate-limit-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;

integration("group public durable rate-limit repository integration", () => {
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("acquires its advisory lock without exposing PostgreSQL's void result to Prisma", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const keyHash = `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const evaluatedAt = new Date();
    const repository = createGroupPublicRateLimitRepository(db);

    try {
      await expect(
        repository.consume(
          [
            {
              keyHash,
              limit: 1,
              windowStartedAt: evaluatedAt,
              expiresAt: new Date(evaluatedAt.getTime() + 60_000),
            },
          ],
          evaluatedAt
        )
      ).resolves.toEqual({ allowed: true });

      await expect(
        repository.consume(
          [
            {
              keyHash,
              limit: 1,
              windowStartedAt: evaluatedAt,
              expiresAt: new Date(evaluatedAt.getTime() + 60_000),
            },
          ],
          evaluatedAt
        )
      ).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 });
    } finally {
      await db.groupPublicRateLimitBucket.deleteMany({ where: { keyHash } });
    }
  });
});
