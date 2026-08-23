import type { PrismaClientInstance } from "@yuni/db";
import { AvatarProviderError } from "@yuni/avatars";
import type { ObjectStorage } from "@yuni/storage";
import { ElevenLabsProviderError } from "@yuni/voice";
import { describe, expect, it, vi } from "vitest";
import { createKnowledgeBaseWorker, type KnowledgeBaseWorkerDependencies } from "./knowledge-base-worker";

function createDependencies(overrides: Partial<KnowledgeBaseWorkerDependencies["provider"]> = {}) {
  const calls: string[] = [];
  const storage: ObjectStorage = {
    name: "test",
    createPresignedUpload: async () => {
      throw new Error("not used");
    },
    head: async () => null,
    download: async () => new Uint8Array(),
    delete: async (key) => {
      calls.push(`storage:${key}`);
    },
  };
  const provider: KnowledgeBaseWorkerDependencies["provider"] = {
    createTextDocument: async (name) => ({ id: "text-id", name }),
    updateTextDocument: async (_id, name) => ({ id: "text-id", name }),
    createFileDocument: async (input) => ({ id: "file-id", name: input.name }),
    deleteKnowledgeBaseDocument: async (id) => {
      calls.push(`document:${id}`);
    },
    computeRagIndex: async () => "ready",
    getRagIndex: async () => "ready",
    syncAvatarAgent: async () => ({
      providerAgentId: "agent-id",
      providerSyncFingerprint: "fingerprint",
      synced: true,
    }),
    deleteAgent: async (id) => {
      calls.push(`agent:${id}`);
    },
    ...overrides,
  };

  return {
    calls,
    dependencies: {
      db: {} as PrismaClientInstance,
      storage,
      provider,
      workerId: "test-worker",
    } satisfies KnowledgeBaseWorkerDependencies,
  };
}

describe("knowledge base cleanup", () => {
  it("deletes direct and group agents, unique provider documents, and storage objects in order", async () => {
    const { calls, dependencies } = createDependencies({
      deleteAgent: async (id) => {
        calls.push(`agent:${id}`);
        throw new ElevenLabsProviderError("not found", undefined, 404);
      },
    });
    const worker = createKnowledgeBaseWorker(dependencies);

    await worker.cleanupAvatar({
      providerAgentId: "agent-1",
      groupProviderAgentId: "agent-group-1",
      providerContextDocumentId: "context-1",
      documents: [
        { providerDocumentId: "file-1", storageKey: "avatars/a/file-1.pdf" },
        { providerDocumentId: "context-1", storageKey: "avatars/a/context.txt" },
        { ignored: true },
      ],
    });

    expect(calls).toEqual([
      "agent:agent-1",
      "agent:agent-group-1",
      "document:context-1",
      "document:file-1",
      "storage:avatars/a/file-1.pdf",
      "storage:avatars/a/context.txt",
    ]);
  });

  it("does not delete documents or storage after a non-404 provider failure", async () => {
    const { calls, dependencies } = createDependencies({
      deleteAgent: async (id) => {
        calls.push(`agent:${id}`);
        throw new ElevenLabsProviderError("unavailable", undefined, 503);
      },
    });
    const worker = createKnowledgeBaseWorker(dependencies);

    await expect(
      worker.cleanupAvatar({
        providerAgentId: "agent-1",
        providerContextDocumentId: "context-1",
        documents: [{ providerDocumentId: "file-1", storageKey: "avatars/a/file-1.pdf" }],
      })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(calls).toEqual(["agent:agent-1"]);
  });
});

describe("LiveAvatar session cleanup", () => {
  it("stops with the decrypted token and clears the ciphertext only for the matching attempt", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const stopSession = vi.fn().mockResolvedValue(undefined);
    const { dependencies } = createDependencies();
    const worker = createKnowledgeBaseWorker({
      ...dependencies,
      db: { realtimeSession: { updateMany } } as unknown as PrismaClientInstance,
      liveAvatarProvider: { stopSession },
      providerTokenProtector: {
        encrypt: vi.fn(),
        decrypt: vi.fn().mockReturnValue("plain-session-token"),
      },
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });

    await worker.cleanupSession({
      version: 1,
      provider: "liveavatar",
      realtimeSessionId: "realtime-1",
      providerSessionTokenCiphertext: "encrypted-token",
    });

    expect(stopSession).toHaveBeenCalledWith("plain-session-token");
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "realtime-1",
        providerSessionTokenCiphertext: "encrypted-token",
        providerStoppedAt: null,
      },
      data: {
        providerStoppedAt: new Date("2030-01-01T00:00:00.000Z"),
        providerSessionTokenCiphertext: null,
      },
    });
  });

  it("treats an already-ended provider session as an idempotent success", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { dependencies } = createDependencies();
    const worker = createKnowledgeBaseWorker({
      ...dependencies,
      db: { realtimeSession: { updateMany } } as unknown as PrismaClientInstance,
      liveAvatarProvider: {
        stopSession: vi.fn().mockRejectedValue(new AvatarProviderError("not found", undefined, 404)),
      },
      providerTokenProtector: {
        encrypt: vi.fn(),
        decrypt: vi.fn().mockReturnValue("plain-session-token"),
      },
    });

    await expect(
      worker.cleanupSession({
        version: 1,
        provider: "liveavatar",
        realtimeSessionId: "realtime-1",
        providerSessionTokenCiphertext: "encrypted-token",
      })
    ).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("scrubs encrypted cleanup payloads after a successful worker run", async () => {
    const jobUpdate = vi.fn().mockResolvedValue({});
    const realtimeUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const { dependencies } = createDependencies();
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "job-1",
          type: "session_cleanup",
          payload: {
            version: 1,
            provider: "liveavatar",
            realtimeSessionId: "realtime-1",
            providerSessionTokenCiphertext: "encrypted-token",
          },
          avatarAgentId: "avatar-1",
          attempts: 1,
          maxAttempts: 12,
        },
      ]),
      job: { update: jobUpdate },
      realtimeSession: { updateMany: realtimeUpdate },
    } as unknown as PrismaClientInstance;
    const worker = createKnowledgeBaseWorker({
      ...dependencies,
      db,
      liveAvatarProvider: { stopSession: vi.fn().mockResolvedValue(undefined) },
      providerTokenProtector: {
        encrypt: vi.fn(),
        decrypt: vi.fn().mockReturnValue("plain-session-token"),
      },
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(jobUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "done",
        payload: { version: 1, provider: "liveavatar", status: "stopped" },
      }),
    });
    expect(JSON.stringify(jobUpdate.mock.calls)).not.toContain("encrypted-token");
  });

  it.each([
    ["timeout", undefined],
    ["rate limit", 429],
    ["provider outage", 503],
  ] as const)(
    "requeues a LiveAvatar %s without scrubbing the token before a successful redelivery",
    async (_label, status) => {
      const cleanupPayload = {
        version: 1,
        provider: "liveavatar",
        realtimeSessionId: "realtime-retry",
        providerSessionTokenCiphertext: "encrypted-retry-token",
      };
      const claimedJob = {
        id: "job-retry",
        type: "session_cleanup",
        payload: cleanupPayload,
        avatarAgentId: "avatar-retry",
        attempts: 1,
        maxAttempts: 12,
      };
      const queryRaw = vi
        .fn()
        .mockResolvedValueOnce([claimedJob])
        .mockResolvedValueOnce([{ ...claimedJob, attempts: 2 }]);
      const jobUpdate = vi.fn().mockResolvedValue({});
      const realtimeUpdate = vi.fn().mockResolvedValue({ count: 1 });
      const stopSession = vi
        .fn()
        .mockRejectedValueOnce(new AvatarProviderError("transient", undefined, status))
        .mockResolvedValueOnce(undefined);
      const { dependencies } = createDependencies();
      const worker = createKnowledgeBaseWorker({
        ...dependencies,
        db: {
          $queryRaw: queryRaw,
          job: { update: jobUpdate },
          realtimeSession: { updateMany: realtimeUpdate },
        } as unknown as PrismaClientInstance,
        liveAvatarProvider: { stopSession },
        providerTokenProtector: {
          encrypt: vi.fn(),
          decrypt: vi.fn().mockReturnValue("plain-retry-token"),
        },
        now: () => new Date("2030-01-01T00:00:00.000Z"),
      });

      await expect(worker.runOnce()).resolves.toBe(true);
      expect(jobUpdate).toHaveBeenCalledTimes(1);
      expect(jobUpdate.mock.calls[0]?.[0]?.data).toMatchObject({ status: "queued" });
      expect(jobUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty("payload");
      expect(cleanupPayload.providerSessionTokenCiphertext).toBe("encrypted-retry-token");
      expect(realtimeUpdate).not.toHaveBeenCalled();

      await expect(worker.runOnce()).resolves.toBe(true);
      expect(stopSession).toHaveBeenCalledTimes(2);
      expect(stopSession).toHaveBeenNthCalledWith(1, "plain-retry-token");
      expect(stopSession).toHaveBeenNthCalledWith(2, "plain-retry-token");
      expect(realtimeUpdate).toHaveBeenCalledOnce();
      expect(jobUpdate.mock.calls[1]?.[0]?.data).toMatchObject({
        status: "done",
        payload: { version: 1, provider: "liveavatar", status: "stopped" },
      });
      expect(JSON.stringify(jobUpdate.mock.calls[1])).not.toContain("encrypted-retry-token");
    }
  );

  it("leaves storage-backed jobs unclaimed when S3 is unavailable", async () => {
    const jobUpdate = vi.fn().mockResolvedValue({});
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: "cleanup-job",
        type: "session_cleanup",
        payload: {
          version: 1,
          provider: "liveavatar",
          realtimeSessionId: "realtime-1",
          providerSessionTokenCiphertext: "encrypted-token",
        },
        avatarAgentId: "avatar-1",
        attempts: 1,
        maxAttempts: 12,
      },
    ]);
    const documentUpdate = vi.fn();
    const db = {
      $queryRaw: queryRaw,
      job: { update: jobUpdate },
      document: { update: documentUpdate },
      realtimeSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaClientInstance;
    const { dependencies } = createDependencies();
    const worker = createKnowledgeBaseWorker({
      db,
      provider: dependencies.provider,
      workerId: dependencies.workerId,
      liveAvatarProvider: { stopSession: vi.fn().mockResolvedValue(undefined) },
      providerTokenProtector: {
        encrypt: vi.fn(),
        decrypt: vi.fn().mockReturnValue("plain-session-token"),
      },
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    const claimSql = JSON.stringify(queryRaw.mock.calls);
    expect(claimSql).toContain("session_cleanup");
    expect(claimSql).toContain("avatar_context_provider_sync");
    expect(claimSql).toContain("agent_provider_sync");
    expect(claimSql).not.toContain("document_provider_sync");
    expect(documentUpdate).not.toHaveBeenCalled();
  });
});
