import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { lockExternalParticipant } from "./repositories/external-session-capacity";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;

integration("external session capacity integration", () => {
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("acquires the normalized participant lock without exposing PostgreSQL's void result", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");

    await expect(
      db.$transaction((transaction) => lockExternalParticipant(transaction, "  Capacity-Person@Example.COM "))
    ).resolves.toBe("capacity-person@example.com");
  });
});
