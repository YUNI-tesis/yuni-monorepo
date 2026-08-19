import type { PrismaClientInstance } from "@yuni/db";
import type { ObjectStorage } from "@yuni/storage";
import { ElevenLabsProviderError } from "@yuni/voice";
import { describe, expect, it, vi } from "vitest";
import { createKnowledgeBaseWorker, type KnowledgeBaseWorkerDependencies } from "./knowledge-base-worker";

type MutableDocument = Record<string, unknown> & {
  status: string;
  uploadConfirmedAt: Date | null;
  providerSync: Record<string, unknown> | null;
};

type MutableAvatar = Record<string, unknown> & {
  context: string;
  providerContextLastUsableAt: Date | null;
};

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

function createDocumentDependencies(options: {
  sizeBytes: number;
  createFileDocument?: KnowledgeBaseWorkerDependencies["provider"]["createFileDocument"];
}) {
  const providerSync: Record<string, unknown> = {
    documentId: "document-1",
    providerDocumentId: null,
    status: "pending",
    ragStatus: null,
  };
  const document: MutableDocument = {
    id: "document-1",
    ownerId: "owner-1",
    avatarAgentId: "avatar-1",
    fileName: "facts.txt",
    mimeType: "text/plain",
    sizeBytes: options.sizeBytes,
    storageKey: "avatars/avatar-1/facts.txt",
    storageEtag: "etag",
    status: "processing",
    uploadConfirmedAt: new Date(),
    deletedAt: null,
    errorMessage: null,
    providerSync: null,
  };
  const avatar: MutableAvatar = {
    id: "avatar-1",
    name: "Tutor",
    description: "",
    instructions: "Help",
    context: "",
    voiceConfig: { provider: "elevenlabs", voiceId: "voice-1", speakingRate: 1 },
    providerAgentId: "agent-1",
    providerSyncFingerprint: null,
    providerSyncStatus: "synced",
    providerSyncedAt: new Date(),
    providerContextDocumentId: null,
    providerContextSyncStatus: "synced",
    providerContextLastUsableAt: null,
  };

  const documentApi = {
    findUnique: vi.fn(async () => document),
    findUniqueOrThrow: vi.fn(async () => document),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(document, data);
      return document;
    }),
    updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(document, data);
      return { count: 1 };
    }),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  };
  const documentProviderSyncApi = {
    upsert: vi.fn(
      async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        Object.assign(providerSync, document.providerSync ? update : create);
        document.providerSync = providerSync;
        return providerSync;
      }
    ),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(providerSync, data);
      return providerSync;
    }),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const syncAvatarAgent = vi.fn(async () => ({
    providerAgentId: "agent-1",
    providerSyncFingerprint: "agent-fingerprint",
    synced: true,
  }));
  const computeRagIndex = vi.fn(async () => "ready" as const);
  const getRagIndex = vi.fn(async () => "ready" as const);
  const jobApi = {
    update: vi.fn(async (input: unknown) => input),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const queryRaw = vi.fn(async (): Promise<unknown[]> => []);
  const transaction = vi.fn(async (input: unknown) => {
    if (typeof input === "function") {
      return input({ $queryRaw: vi.fn(async () => [{ acquired: true }]) });
    }
    return Promise.all(input as Array<Promise<unknown>>);
  });
  const db = {
    document: documentApi,
    documentProviderSync: documentProviderSyncApi,
    job: jobApi,
    avatarAgent: {
      findUnique: vi.fn(async () => ({ ...avatar, documents: [{ ...document, providerSync }] })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(avatar, data);
        return avatar;
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaClientInstance;
  const storage: ObjectStorage = {
    name: "test",
    createPresignedUpload: async () => {
      throw new Error("not used");
    },
    head: async () => null,
    download: vi.fn(async () => new Uint8Array(options.sizeBytes)),
    delete: vi.fn(async () => undefined),
  };
  const provider: KnowledgeBaseWorkerDependencies["provider"] = {
    createTextDocument: async (name) => ({ id: "text-id", name }),
    updateTextDocument: async (_id, name) => ({ id: "text-id", name }),
    createFileDocument:
      options.createFileDocument ?? (async (input) => ({ id: "file-id", name: input.name })),
    deleteKnowledgeBaseDocument: async () => undefined,
    computeRagIndex,
    getRagIndex,
    syncAvatarAgent,
    deleteAgent: async () => undefined,
  };

  return {
    document,
    providerSync,
    documentApi,
    storage,
    syncAvatarAgent,
    computeRagIndex,
    getRagIndex,
    jobApi,
    queryRaw,
    transaction,
    dependencies: { db, storage, provider, workerId: "worker-1" } satisfies KnowledgeBaseWorkerDependencies,
  };
}

function createContextDependencies(
  syncAvatarAgent: KnowledgeBaseWorkerDependencies["provider"]["syncAvatarAgent"]
) {
  const avatar: MutableAvatar = {
    id: "avatar-1",
    name: "Tutor",
    description: "",
    instructions: "Help",
    context: "Current context",
    voiceConfig: { provider: "elevenlabs", voiceId: "voice-1", speakingRate: 1 },
    providerAgentId: null,
    providerSyncFingerprint: null,
    providerSyncStatus: "not_synced",
    providerSyncedAt: null,
    providerLastUsableAt: null,
    providerContextDocumentId: null,
    providerContextSyncStatus: "pending",
    providerContextLastUsableAt: null,
  };
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (where.context !== undefined && where.context !== avatar.context) return { count: 0 };
      Object.assign(avatar, data);
      return { count: 1 };
    }
  );
  const db = {
    avatarAgent: {
      findUnique: vi.fn(async () => ({ ...avatar, documents: [] })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(avatar, data);
        return avatar;
      }),
      updateMany,
    },
  } as unknown as PrismaClientInstance;
  const storage: ObjectStorage = {
    name: "test",
    createPresignedUpload: async () => {
      throw new Error("not used");
    },
    head: async () => null,
    download: async () => new Uint8Array(),
    delete: async () => undefined,
  };
  const provider: KnowledgeBaseWorkerDependencies["provider"] = {
    createTextDocument: vi.fn(async (name) => ({ id: "context-document-1", name })),
    updateTextDocument: vi.fn(async (_id, name) => ({ id: "context-document-1", name })),
    createFileDocument: async (input) => ({ id: "file-id", name: input.name }),
    deleteKnowledgeBaseDocument: async () => undefined,
    computeRagIndex: async () => "ready",
    getRagIndex: async () => "ready",
    syncAvatarAgent,
    deleteAgent: async () => undefined,
  };
  return {
    avatar,
    updateMany,
    provider,
    dependencies: { db, storage, provider, workerId: "worker-1" } satisfies KnowledgeBaseWorkerDependencies,
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

describe("knowledge base document synchronization", () => {
  it("attaches documents below the ElevenLabs RAG minimum without computing an index", async () => {
    const setup = createDocumentDependencies({ sizeBytes: 128 });
    const worker = createKnowledgeBaseWorker(setup.dependencies);

    await worker.syncDocument("document-1");

    expect(setup.computeRagIndex).not.toHaveBeenCalled();
    expect(setup.getRagIndex).not.toHaveBeenCalled();
    expect(setup.syncAvatarAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeBase: [expect.objectContaining({ id: "file-id", type: "file", usage_mode: "auto" })],
      })
    );
    expect(setup.document.status).toBe("ready");
    expect(setup.providerSync).toMatchObject({ status: "synced", ragStatus: "not_required" });
  });

  it("does not publish a terminal failed state for a transient provider error", async () => {
    const setup = createDocumentDependencies({
      sizeBytes: 128,
      createFileDocument: async () => {
        throw new ElevenLabsProviderError("unavailable", undefined, 503);
      },
    });
    const worker = createKnowledgeBaseWorker(setup.dependencies);
    setup.queryRaw.mockResolvedValueOnce([
      {
        id: "job-1",
        type: "document_provider_sync",
        payload: { documentId: "document-1" },
        avatarAgentId: "avatar-1",
        attempts: 1,
        maxAttempts: 8,
      },
    ]);

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(setup.document.status).toBe("processing");
    expect(setup.documentApi.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) })
    );
    expect(setup.providerSync.status).toBe("uploading");
    expect(setup.jobApi.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({ status: "queued" }),
      })
    );
  });
});

describe("pending upload cleanup", () => {
  it("claims an expired pending upload before deleting its object", async () => {
    const setup = createDocumentDependencies({ sizeBytes: 128 });
    setup.document.status = "pending_upload";
    setup.document.uploadConfirmedAt = null;
    const worker = createKnowledgeBaseWorker(setup.dependencies);

    await worker.cleanupPendingUpload("document-1");

    expect(setup.documentApi.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "pending_upload", uploadConfirmedAt: null }),
        data: expect.objectContaining({ status: "deleting" }),
      })
    );
    expect(setup.storage.delete).toHaveBeenCalledWith("avatars/avatar-1/facts.txt");
    expect(setup.documentApi.deleteMany).toHaveBeenCalledWith({
      where: { id: "document-1", uploadConfirmedAt: null },
    });
  });

  it("leaves a confirmed upload untouched", async () => {
    const setup = createDocumentDependencies({ sizeBytes: 128 });
    const worker = createKnowledgeBaseWorker(setup.dependencies);

    await worker.cleanupPendingUpload("document-1");

    expect(setup.storage.delete).not.toHaveBeenCalled();
    expect(setup.documentApi.deleteMany).not.toHaveBeenCalled();
  });
});

describe("text context synchronization", () => {
  it("ignores a job whose expected context fingerprint is stale", async () => {
    const syncAvatarAgent = vi.fn(async () => ({
      providerAgentId: "agent-1",
      providerSyncFingerprint: "agent-fingerprint",
      synced: true,
    }));
    const setup = createContextDependencies(syncAvatarAgent);
    const worker = createKnowledgeBaseWorker(setup.dependencies);

    await worker.syncContext("avatar-1", "stale-fingerprint");

    expect(setup.updateMany).not.toHaveBeenCalled();
    expect(setup.provider.createTextDocument).not.toHaveBeenCalled();
    expect(syncAvatarAgent).not.toHaveBeenCalled();
  });

  it("does not mark the text usable until the agent association succeeds", async () => {
    const syncAvatarAgent = vi.fn(async () => {
      throw new ElevenLabsProviderError("unavailable", undefined, 503);
    });
    const setup = createContextDependencies(syncAvatarAgent);
    const worker = createKnowledgeBaseWorker(setup.dependencies);

    await expect(worker.syncContext("avatar-1")).rejects.toMatchObject({ statusCode: 503 });

    expect(setup.avatar.providerContextLastUsableAt).toBeNull();
    expect(setup.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerContextLastUsableAt: expect.any(Date) }),
      })
    );
  });
});

describe("provider projection locking", () => {
  it("defers without consuming an attempt when another worker owns the avatar lock", async () => {
    const setup = createDocumentDependencies({ sizeBytes: 128 });
    setup.queryRaw.mockResolvedValueOnce([
      {
        id: "job-1",
        type: "agent_provider_sync",
        payload: { avatarId: "avatar-1" },
        avatarAgentId: "avatar-1",
        attempts: 1,
        maxAttempts: 8,
      },
    ]);
    setup.transaction.mockResolvedValueOnce({ acquired: false });
    const worker = createKnowledgeBaseWorker(setup.dependencies);

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(setup.syncAvatarAgent).not.toHaveBeenCalled();
    expect(setup.jobApi.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "queued",
          attempts: { decrement: 1 },
        }),
      })
    );
  });
});
