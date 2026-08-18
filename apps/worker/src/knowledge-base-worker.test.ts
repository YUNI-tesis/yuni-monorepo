import type { PrismaClientInstance } from "@yuni/db";
import type { ObjectStorage } from "@yuni/storage";
import { ElevenLabsProviderError } from "@yuni/voice";
import { describe, expect, it } from "vitest";
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
  it("deletes the agent, unique provider documents, and storage objects in that order", async () => {
    const { calls, dependencies } = createDependencies({
      deleteAgent: async (id) => {
        calls.push(`agent:${id}`);
        throw new ElevenLabsProviderError("not found", undefined, 404);
      },
    });
    const worker = createKnowledgeBaseWorker(dependencies);

    await worker.cleanupAvatar({
      providerAgentId: "agent-1",
      providerContextDocumentId: "context-1",
      documents: [
        { providerDocumentId: "file-1", storageKey: "avatars/a/file-1.pdf" },
        { providerDocumentId: "context-1", storageKey: "avatars/a/context.txt" },
        { ignored: true },
      ],
    });

    expect(calls).toEqual([
      "agent:agent-1",
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
