import { PrismaClient } from "@prisma/client";
import type { ProviderTokenProtector } from "@yuni/avatars";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createKnowledgeBaseWorker, type KnowledgeBaseWorkerDependencies } from "./knowledge-base-worker";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;

integration("knowledge base worker integration", () => {
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("processes session cleanup without S3 while leaving an older document job untouched", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const documentJob = await db.job.create({
      data: {
        type: "document_provider_sync",
        payload: { documentId: `document-${suffix}` },
        dedupeKey: `worker-no-s3-document-${suffix}`,
        createdAt: new Date("1970-01-01T00:00:00.000Z"),
      },
    });
    const cleanupJob = await db.job.create({
      data: {
        type: "session_cleanup",
        payload: {
          version: 1,
          provider: "liveavatar",
          realtimeSessionId: `realtime-${suffix}`,
          providerSessionTokenCiphertext: `ciphertext-${suffix}`,
        },
        dedupeKey: `worker-no-s3-cleanup-${suffix}`,
        maxAttempts: 12,
        createdAt: new Date("1970-01-02T00:00:00.000Z"),
      },
    });
    const stopSession = vi.fn().mockResolvedValue(undefined);
    const protector: ProviderTokenProtector = {
      encrypt: vi.fn(),
      decrypt: vi.fn().mockReturnValue(`plain-token-${suffix}`),
    };

    try {
      const worker = createKnowledgeBaseWorker({
        db,
        provider: {} as KnowledgeBaseWorkerDependencies["provider"],
        liveAvatarProvider: { stopSession },
        providerTokenProtector: protector,
        workerId: `no-s3-${suffix}`,
      });

      await expect(worker.runOnce()).resolves.toBe(true);
      const [persistedDocument, persistedCleanup] = await Promise.all([
        db.job.findUniqueOrThrow({ where: { id: documentJob.id } }),
        db.job.findUniqueOrThrow({ where: { id: cleanupJob.id } }),
      ]);

      expect(stopSession).toHaveBeenCalledWith(`plain-token-${suffix}`);
      expect(persistedDocument).toMatchObject({ status: "queued", attempts: 0 });
      expect(persistedCleanup).toMatchObject({
        status: "done",
        attempts: 1,
        payload: { version: 1, provider: "liveavatar", status: "stopped" },
      });
      expect(JSON.stringify(persistedCleanup.payload)).not.toContain(`ciphertext-${suffix}`);
    } finally {
      await db.job.deleteMany({ where: { id: { in: [documentJob.id, cleanupJob.id] } } });
    }
  });
});
