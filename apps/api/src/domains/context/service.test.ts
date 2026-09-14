import { describe, expect, it, vi } from "vitest";
import { InMemoryObjectStorage } from "@yuni/storage";
import type { AvatarContextRepository } from "./repository";
import { InvalidStoredUploadError, createAvatarContextService } from "./service";

const now = new Date("2026-08-17T12:00:00.000Z");

function contextRecord() {
  return {
    id: "avatar-1",
    ownerId: "owner-1",
    name: "Tutor",
    description: "",
    instructions: "Help",
    context: "Unique fact",
    voiceConfig: {},
    liveAvatarConfig: {},
    agentProvider: "elevenlabs_agents",
    providerAgentId: "agent-secret",
    providerSyncStatus: "syncing",
    providerSyncError: "raw provider error",
    providerSyncedAt: now,
    providerSyncFingerprint: "fingerprint-secret",
    providerLastUsableAt: now,
    providerContextDocumentId: "provider-context-secret",
    providerContextSyncStatus: "syncing",
    providerContextFingerprint: "context-fingerprint-secret",
    providerContextError: "raw context error",
    providerContextSyncedAt: now,
    providerContextLastUsableAt: now,
    status: "active",
    createdAt: now,
    updatedAt: now,
    documents: [
      {
        id: "document-1",
        ownerId: "owner-1",
        avatarAgentId: "avatar-1",
        fileName: "guide.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        storageKey: "private/storage/key",
        status: "ready",
        uploadConfirmedAt: now,
        storageEtag: "private-etag",
        deletedAt: null,
        errorMessage: "raw document error",
        createdAt: now,
        updatedAt: now,
        providerSync: {
          id: "sync-1",
          documentId: "document-1",
          provider: "elevenlabs_agents",
          providerDocumentId: "provider-document-secret",
          status: "synced",
          ragStatus: "ready",
          fingerprint: "provider-fingerprint-secret",
          errorMessage: null,
          providerLastUsableAt: now,
          createdAt: now,
          updatedAt: now,
        },
      },
    ],
  };
}

function repository(overrides: Record<string, unknown> = {}) {
  return {
    getForOwner: vi.fn(async () => contextRecord()),
    updateText: vi.fn(async () => contextRecord()),
    createPendingDocument: vi.fn(),
    schedulePendingUploadCleanup: vi.fn(),
    discardPendingUpload: vi.fn(),
    findDocumentForOwner: vi.fn(),
    confirmUpload: vi.fn(),
    retry: vi.fn(),
    markDeleting: vi.fn(),
    ...overrides,
  } as unknown as AvatarContextRepository;
}

describe("avatar context service", () => {
  it("returns product states without storage or ElevenLabs internals", async () => {
    const service = createAvatarContextService({ repository: repository() });
    const result = await service.get("owner-1", "avatar-1");
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      text: "Unique fact",
      status: "processing",
      hasPreviousUsableVersion: true,
      documents: [{ id: "document-1", status: "ready", hasPreviousUsableVersion: true }],
    });
    expect(serialized).not.toMatch(/storageKey|providerDocumentId|fingerprint|raw provider|private-etag/);
  });

  it("keeps a ready text independent from failed documents", async () => {
    const record = contextRecord();
    record.providerContextSyncStatus = "synced";
    record.documents[0]!.status = "failed";
    record.documents[0]!.errorMessage = "Knowledge base indexing failed";
    const service = createAvatarContextService({
      repository: repository({ getForOwner: async () => record }),
    });
    const result = await service.get("owner-1", "avatar-1");
    expect(result).toMatchObject({ status: "failed", textStatus: "ready", textError: null });
    expect(result.documents[0]!.error).toContain("No se pudo preparar el contenido");
  });

  it("reports text failure even without documents and preserves a retry explanation", async () => {
    const record = contextRecord();
    record.providerContextSyncStatus = "failed";
    record.providerContextError = "ElevenLabs quota or rate limit reached";
    record.documents = [];
    const service = createAvatarContextService({
      repository: repository({ getForOwner: async () => record }),
    });
    const result = await service.get("owner-1", "avatar-1");
    expect(result).toMatchObject({
      status: "failed",
      textStatus: "failed",
      textHasPreviousUsableVersion: true,
    });
    expect(result.textError).toContain("límite de procesamiento");
  });

  it("uses the provider projection failure without exposing raw messages", async () => {
    const record = contextRecord();
    record.documents[0]!.errorMessage = "";
    record.documents[0]!.providerSync!.status = "failed";
    Object.assign(record.documents[0]!.providerSync!, {
      errorMessage: "ElevenLabs is temporarily unavailable",
    });
    const service = createAvatarContextService({
      repository: repository({ getForOwner: async () => record }),
    });
    expect((await service.get("owner-1", "avatar-1")).documents[0]!.error).toContain("temporalmente");
    record.documents[0]!.errorMessage = "private/storage/key token=secret provider request";
    const result = await service.get("owner-1", "avatar-1");
    expect(result.documents[0]!.error).toContain("no recibimos un motivo específico");
    expect(JSON.stringify(result)).not.toMatch(/private|token=|secret|raw/);
  });

  it("validates the real file extension before allocating storage", async () => {
    const storage = new InMemoryObjectStorage();
    const service = createAvatarContextService({ repository: repository(), storage });
    await expect(
      service.presign("owner-1", "avatar-1", {
        fileName: "malicious.exe",
        mimeType: "application/pdf",
        sizeBytes: 10,
      })
    ).rejects.toBeInstanceOf(InvalidStoredUploadError);
  });

  it("schedules cleanup after the presigned upload expires", async () => {
    const storage = new InMemoryObjectStorage(60);
    const document = {
      ...contextRecord().documents[0]!,
      id: "pending-document",
      status: "pending_upload",
      uploadConfirmedAt: null,
      providerSync: null,
    };
    const schedulePendingUploadCleanup = vi.fn();
    const service = createAvatarContextService({
      repository: repository({
        createPendingDocument: vi.fn(async () => document),
        schedulePendingUploadCleanup,
      }),
      storage,
    });

    const result = await service.presign("owner-1", "avatar-1", {
      fileName: "guide.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
    });

    const cleanupAt = schedulePendingUploadCleanup.mock.calls[0]?.[3] as Date;
    expect(schedulePendingUploadCleanup).toHaveBeenCalledWith(
      "owner-1",
      "pending-document",
      "avatar-1",
      expect.any(Date)
    );
    expect(cleanupAt.getTime()).toBe(result.upload.expiresAt.getTime() + 5 * 60 * 1000);
  });

  it("discards the pending record when presigning fails", async () => {
    const storage = new InMemoryObjectStorage();
    vi.spyOn(storage, "createPresignedUpload").mockRejectedValue(new Error("signing failed"));
    const document = {
      ...contextRecord().documents[0]!,
      id: "pending-document",
      status: "pending_upload",
      uploadConfirmedAt: null,
      providerSync: null,
    };
    const discardPendingUpload = vi.fn();
    const service = createAvatarContextService({
      repository: repository({
        createPendingDocument: vi.fn(async () => document),
        discardPendingUpload,
      }),
      storage,
    });

    await expect(
      service.presign("owner-1", "avatar-1", {
        fileName: "guide.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
      })
    ).rejects.toThrow("signing failed");
    expect(discardPendingUpload).toHaveBeenCalledWith("owner-1", "pending-document");
  });

  it("confirms only when HEAD matches the expected size and type", async () => {
    const storage = new InMemoryObjectStorage();
    storage.put("private/storage/key", new Uint8Array([1, 2, 3]), "application/pdf", "etag");
    const record = { ...contextRecord().documents[0]!, uploadConfirmedAt: null };
    const confirmUpload = vi.fn(async () => record);
    const service = createAvatarContextService({
      repository: repository({ findDocumentForOwner: vi.fn(async () => record), confirmUpload }),
      storage,
    });

    await service.confirm("owner-1", "document-1");
    expect(confirmUpload).toHaveBeenCalledWith("owner-1", "document-1", "etag");
  });

  it("rejects a mismatched object without enqueueing provider work", async () => {
    const storage = new InMemoryObjectStorage();
    storage.put("private/storage/key", new Uint8Array([1]), "application/pdf", "etag");
    const record = { ...contextRecord().documents[0]!, uploadConfirmedAt: null };
    const confirmUpload = vi.fn();
    const service = createAvatarContextService({
      repository: repository({ findDocumentForOwner: vi.fn(async () => record), confirmUpload }),
      storage,
    });

    await expect(service.confirm("owner-1", "document-1")).rejects.toBeInstanceOf(InvalidStoredUploadError);
    expect(confirmUpload).not.toHaveBeenCalled();
  });
});
