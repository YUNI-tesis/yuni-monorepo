import { createHash } from "node:crypto";
import type { PrismaClientInstance } from "@yuni/db";
import { createJobRepository } from "@yuni/db";
import { MAX_DOCUMENT_SIZE_BYTES, VoiceConfigSchema } from "@yuni/domain";
import { ObjectNotFoundError, ObjectTooLargeError, type ObjectStorage } from "@yuni/storage";
import {
  ElevenLabsProviderError,
  isTransientElevenLabsError,
  type ElevenLabsAgentProvider,
  type ElevenLabsKnowledgeBaseReference,
} from "@yuni/voice";

const ELEVENLABS_MIN_RAG_DOCUMENT_BYTES = 500;

class RagStillProcessingError extends Error {
  constructor() {
    super("Knowledge base index is still processing");
    this.name = "RagStillProcessingError";
  }
}

class ProviderDocumentMissingError extends Error {
  constructor() {
    super("Provider document disappeared and will be recreated");
    this.name = "ProviderDocumentMissingError";
  }
}

class AvatarProjectionBusyError extends Error {
  constructor() {
    super("Another provider projection is running for this avatar");
    this.name = "AvatarProjectionBusyError";
  }
}

type SyncAgentOptions = {
  includeDocumentId?: string;
  contextDocumentId?: string;
};

export type KnowledgeBaseWorkerDependencies = {
  db: PrismaClientInstance;
  storage: ObjectStorage;
  provider: Pick<
    ElevenLabsAgentProvider,
    | "createTextDocument"
    | "updateTextDocument"
    | "createFileDocument"
    | "deleteKnowledgeBaseDocument"
    | "computeRagIndex"
    | "getRagIndex"
    | "syncAvatarAgent"
    | "deleteAgent"
  >;
  workerId: string;
  now?: () => Date;
};

export function createKnowledgeBaseWorker(dependencies: KnowledgeBaseWorkerDependencies) {
  const jobs = createJobRepository(dependencies.db);
  const now = dependencies.now ?? (() => new Date());

  async function syncAgent(avatarId: string, options: SyncAgentOptions = {}) {
    const avatar = await dependencies.db.avatarAgent.findUnique({
      where: { id: avatarId },
      include: {
        documents: {
          where: { deletedAt: null },
          include: { providerSync: true },
        },
      },
    });
    if (!avatar) return;
    const voice = VoiceConfigSchema.safeParse(avatar.voiceConfig);
    if (!voice.success) throw new Error("Avatar voice configuration is invalid");

    const knowledgeBase: ElevenLabsKnowledgeBaseReference[] = [];
    const contextDocumentId =
      options.contextDocumentId ??
      (avatar.providerContextSyncStatus === "synced" ? avatar.providerContextDocumentId : null);
    const textReady = Boolean(contextDocumentId);
    if (contextDocumentId) {
      knowledgeBase.push({
        type: "text",
        name: `YUNI Context - ${avatar.name}`,
        id: contextDocumentId,
        usage_mode: "prompt",
      });
    }
    for (const document of avatar.documents) {
      const providerSync = document.providerSync;
      if (
        providerSync?.providerDocumentId &&
        (providerSync.status === "synced" || document.id === options.includeDocumentId)
      ) {
        knowledgeBase.push({
          type: "file",
          name: document.fileName,
          id: providerSync.providerDocumentId,
          usage_mode: "auto",
        });
      }
    }

    await dependencies.db.avatarAgent.update({
      where: { id: avatarId },
      data: { providerSyncStatus: "syncing", providerSyncError: null },
    });
    const result = await dependencies.provider.syncAvatarAgent({
      id: avatar.id,
      name: avatar.name,
      description: avatar.description,
      instructions: avatar.instructions,
      context: avatar.context,
      voiceConfig: voice.data,
      providerAgentId: avatar.providerAgentId,
      providerSyncFingerprint: avatar.providerSyncFingerprint,
      knowledgeBase,
      includeInlineContext: !textReady,
    });
    const usableAt = now();
    await dependencies.db.avatarAgent.update({
      where: { id: avatarId },
      data: {
        providerAgentId: result.providerAgentId,
        providerSyncFingerprint: result.providerSyncFingerprint,
        providerSyncStatus: "synced",
        providerSyncError: null,
        providerSyncedAt: result.synced ? usableAt : avatar.providerSyncedAt,
        providerLastUsableAt: usableAt,
      },
    });
  }

  async function syncContext(avatarId: string, expectedFingerprint?: string) {
    const avatar = await dependencies.db.avatarAgent.findUnique({ where: { id: avatarId } });
    if (!avatar) return;
    const desiredFingerprint = fingerprint(avatar.context);
    if (expectedFingerprint && expectedFingerprint !== desiredFingerprint) return;
    const claimed = await dependencies.db.avatarAgent.updateMany({
      where: { id: avatarId, context: avatar.context },
      data: {
        providerContextSyncStatus: avatar.context ? "syncing" : "deleting",
        providerContextError: null,
      },
    });
    if (claimed.count === 0) return;

    if (!avatar.context.trim()) {
      await syncAgent(avatarId);
      if (avatar.providerContextDocumentId) {
        await ignoreProviderNotFound(() =>
          dependencies.provider.deleteKnowledgeBaseDocument(avatar.providerContextDocumentId!, true)
        );
      }
      await dependencies.db.avatarAgent.updateMany({
        where: { id: avatarId, context: avatar.context },
        data: {
          providerContextDocumentId: null,
          providerContextSyncStatus: "synced",
          providerContextFingerprint: desiredFingerprint,
          providerContextError: null,
          providerContextSyncedAt: now(),
        },
      });
      return;
    }

    let external;
    let createdDocument = false;
    if (avatar.providerContextDocumentId) {
      try {
        external = await dependencies.provider.updateTextDocument(
          avatar.providerContextDocumentId,
          `YUNI Context - ${avatar.name}`,
          avatar.context
        );
      } catch (error) {
        if (!isProviderNotFound(error)) throw error;
        external = await dependencies.provider.createTextDocument(
          `YUNI Context - ${avatar.name}`,
          avatar.context
        );
        createdDocument = true;
      }
    } else {
      external = await dependencies.provider.createTextDocument(
        `YUNI Context - ${avatar.name}`,
        avatar.context
      );
      createdDocument = true;
    }
    const persisted = await dependencies.db.avatarAgent.updateMany({
      where: { id: avatarId, context: avatar.context },
      data: { providerContextDocumentId: external.id, providerContextSyncStatus: "syncing" },
    });
    if (persisted.count === 0) {
      if (createdDocument) {
        await ignoreProviderNotFound(() =>
          dependencies.provider.deleteKnowledgeBaseDocument(external.id, true)
        );
      }
      return;
    }

    await syncAgent(avatarId, { contextDocumentId: external.id });
    const usableAt = now();
    const completed = await dependencies.db.avatarAgent.updateMany({
      where: {
        id: avatarId,
        context: avatar.context,
        providerContextDocumentId: external.id,
      },
      data: {
        providerContextSyncStatus: "synced",
        providerContextFingerprint: desiredFingerprint,
        providerContextError: null,
        providerContextSyncedAt: usableAt,
        providerContextLastUsableAt: usableAt,
      },
    });
    if (completed.count === 0) {
      await dependencies.db.avatarAgent.updateMany({
        where: { id: avatarId, providerContextDocumentId: external.id },
        data: {
          providerContextLastUsableAt: usableAt,
        },
      });
    }
  }

  async function syncDocument(documentId: string) {
    let document = await dependencies.db.document.findUnique({
      where: { id: documentId },
      include: { providerSync: true },
    });
    if (!document || document.deletedAt) return;
    if (!document.uploadConfirmedAt) throw new Error("Document upload is not confirmed");

    let providerDocumentId = document.providerSync?.providerDocumentId ?? null;
    if (!providerDocumentId) {
      await upsertDocumentSync(documentId, { status: "uploading", errorMessage: null });
      const bytes = await dependencies.storage.download(document.storageKey, MAX_DOCUMENT_SIZE_BYTES);
      const external = await dependencies.provider.createFileDocument({
        name: document.fileName,
        fileName: document.fileName,
        mimeType: document.mimeType,
        bytes,
      });
      providerDocumentId = external.id;
      await upsertDocumentSync(documentId, {
        providerDocumentId,
        status: document.sizeBytes < ELEVENLABS_MIN_RAG_DOCUMENT_BYTES ? "attaching" : "indexing",
        ragStatus: document.sizeBytes < ELEVENLABS_MIN_RAG_DOCUMENT_BYTES ? "not_required" : "not_started",
        fingerprint: fingerprint(`${document.storageEtag ?? ""}:${document.sizeBytes}:${document.mimeType}`),
      });
      document = await dependencies.db.document.findUniqueOrThrow({
        where: { id: documentId },
        include: { providerSync: true },
      });
    }

    let finalRagStatus = "not_required";
    if (document.sizeBytes >= ELEVENLABS_MIN_RAG_DOCUMENT_BYTES) {
      let ragStatus;
      try {
        ragStatus =
          document.providerSync?.ragStatus === "processing"
            ? await dependencies.provider.getRagIndex(providerDocumentId)
            : await dependencies.provider.computeRagIndex(
                providerDocumentId,
                "multilingual_e5_large_instruct"
              );
      } catch (error) {
        if (!isProviderNotFound(error)) throw error;
        await upsertDocumentSync(documentId, {
          providerDocumentId: null,
          status: "pending",
          ragStatus: null,
        });
        throw new ProviderDocumentMissingError();
      }

      if (ragStatus === "failed") throw new Error("Knowledge base indexing failed");
      if (ragStatus !== "ready") {
        await upsertDocumentSync(documentId, { status: "indexing", ragStatus: "processing" });
        throw new RagStillProcessingError();
      }
      finalRagStatus = "ready";
    }

    document = await dependencies.db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { providerSync: true },
    });
    if (document.deletedAt) return;
    await upsertDocumentSync(documentId, { status: "attaching", ragStatus: finalRagStatus });
    await syncAgent(document.avatarAgentId, { includeDocumentId: documentId });
    const currentDocument = await dependencies.db.document.findUnique({ where: { id: documentId } });
    if (!currentDocument || currentDocument.deletedAt) {
      await syncAgent(document.avatarAgentId);
      return;
    }
    const usableAt = now();
    await dependencies.db.$transaction([
      dependencies.db.documentProviderSync.update({
        where: { documentId },
        data: {
          status: "synced",
          ragStatus: finalRagStatus,
          errorMessage: null,
          providerLastUsableAt: usableAt,
        },
      }),
      dependencies.db.document.update({
        where: { id: documentId },
        data: { status: "ready", errorMessage: null },
      }),
    ]);
  }

  function upsertDocumentSync(
    documentId: string,
    data: {
      providerDocumentId?: string | null;
      status?: "pending" | "uploading" | "indexing" | "attaching" | "synced" | "failed";
      ragStatus?: string | null;
      fingerprint?: string | null;
      errorMessage?: string | null;
    }
  ) {
    return dependencies.db.documentProviderSync.upsert({
      where: { documentId },
      create: { documentId, ...data },
      update: data,
    });
  }

  async function cleanupDocument(documentId: string) {
    const document = await dependencies.db.document.findUnique({
      where: { id: documentId },
      include: { providerSync: true },
    });
    if (!document) return;
    await syncAgent(document.avatarAgentId);
    if (document.providerSync?.providerDocumentId) {
      await ignoreProviderNotFound(() =>
        dependencies.provider.deleteKnowledgeBaseDocument(document.providerSync!.providerDocumentId!, true)
      );
    }
    await dependencies.storage.delete(document.storageKey);
    await dependencies.db.document.delete({ where: { id: documentId } });
  }

  async function cleanupPendingUpload(documentId: string) {
    let document = await dependencies.db.document.findUnique({ where: { id: documentId } });
    if (!document || document.uploadConfirmedAt) return;
    if (document.status === "pending_upload") {
      const claimed = await dependencies.db.document.updateMany({
        where: { id: documentId, status: "pending_upload", uploadConfirmedAt: null },
        data: { status: "deleting", deletedAt: now() },
      });
      if (claimed.count === 0) return;
      document = await dependencies.db.document.findUnique({ where: { id: documentId } });
    }
    if (!document || document.uploadConfirmedAt || document.status !== "deleting") return;
    await dependencies.storage.delete(document.storageKey);
    await dependencies.db.document.deleteMany({
      where: { id: documentId, uploadConfirmedAt: null },
    });
  }

  async function cleanupAvatar(payload: Record<string, unknown>) {
    const providerAgentId = readString(payload.providerAgentId);
    if (providerAgentId)
      await ignoreProviderNotFound(() => dependencies.provider.deleteAgent(providerAgentId));
    const ids = new Set<string>();
    const contextId = readString(payload.providerContextDocumentId);
    if (contextId) ids.add(contextId);
    const documents = Array.isArray(payload.documents) ? payload.documents : [];
    for (const item of documents) {
      if (!isRecord(item)) continue;
      const providerDocumentId = readString(item.providerDocumentId);
      if (providerDocumentId) ids.add(providerDocumentId);
    }
    for (const id of ids) {
      await ignoreProviderNotFound(() => dependencies.provider.deleteKnowledgeBaseDocument(id, true));
    }
    for (const item of documents) {
      if (!isRecord(item)) continue;
      const storageKey = readString(item.storageKey);
      if (storageKey) await dependencies.storage.delete(storageKey);
    }
  }

  async function execute(job: NonNullable<Awaited<ReturnType<typeof jobs.claimNext>>>) {
    const payload = isRecord(job.payload) ? job.payload : {};
    const avatarId = readString(payload.avatarId) ?? job.avatarAgentId;
    const documentId = readString(payload.documentId);
    switch (job.type) {
      case "avatar_context_provider_sync":
        if (avatarId) await syncContext(avatarId, readString(payload.contextFingerprint) ?? undefined);
        return;
      case "document_provider_sync":
        if (documentId) await syncDocument(documentId);
        return;
      case "agent_provider_sync":
        if (avatarId) await syncAgent(avatarId);
        return;
      case "provider_document_cleanup":
        if (documentId) {
          if (payload.pendingUploadOnly === true) await cleanupPendingUpload(documentId);
          else await cleanupDocument(documentId);
        }
        return;
      case "avatar_provider_cleanup":
        await cleanupAvatar(payload);
        return;
      default:
        return;
    }
  }

  async function markTerminalFailure(
    job: NonNullable<Awaited<ReturnType<typeof jobs.claimNext>>>,
    error: unknown
  ) {
    const payload = isRecord(job.payload) ? job.payload : {};
    const avatarId = readString(payload.avatarId) ?? job.avatarAgentId;
    const documentId = readString(payload.documentId);
    const errorMessage = safeError(error);
    if (job.type === "avatar_context_provider_sync" && avatarId) {
      const expectedFingerprint = readString(payload.contextFingerprint);
      if (expectedFingerprint) {
        const current = await dependencies.db.avatarAgent.findUnique({ where: { id: avatarId } });
        if (!current || fingerprint(current.context) !== expectedFingerprint) return;
      }
      await dependencies.db.avatarAgent.updateMany({
        where: { id: avatarId },
        data: {
          providerContextSyncStatus: "failed",
          providerContextError: errorMessage,
          providerSyncStatus: "failed",
          providerSyncError: errorMessage,
        },
      });
    } else if (job.type === "agent_provider_sync" && avatarId) {
      await dependencies.db.avatarAgent.updateMany({
        where: { id: avatarId },
        data: { providerSyncStatus: "failed", providerSyncError: errorMessage },
      });
    } else if (job.type === "document_provider_sync" && documentId) {
      await Promise.all([
        dependencies.db.document.updateMany({
          where: { id: documentId },
          data: { status: "failed", errorMessage },
        }),
        dependencies.db.documentProviderSync.updateMany({
          where: { documentId },
          data: { status: "failed", errorMessage },
        }),
      ]);
    }
  }

  return {
    recoverStalled(lockedBefore: Date) {
      return jobs.recoverStalled(lockedBefore);
    },
    async runOnce() {
      const job = await jobs.claimNext(dependencies.workerId);
      if (!job) return false;
      const payload = isRecord(job.payload) ? job.payload : {};
      const lockAvatarId = readString(payload.avatarId) ?? job.avatarAgentId;
      const heartbeat = setInterval(() => {
        void jobs.heartbeat(job.id, dependencies.workerId).catch(() => undefined);
      }, 60_000);
      heartbeat.unref?.();
      try {
        if (lockAvatarId) {
          const locked = await jobs.runWithAvatarLock(lockAvatarId, () => execute(job));
          if (!locked.acquired) throw new AvatarProjectionBusyError();
        } else {
          await execute(job);
        }
        await jobs.markDone(job.id);
      } catch (error) {
        const deferred =
          error instanceof RagStillProcessingError ||
          error instanceof ProviderDocumentMissingError ||
          error instanceof AvatarProjectionBusyError;
        if (deferred) {
          const delay =
            error instanceof RagStillProcessingError
              ? 10_000
              : error instanceof AvatarProjectionBusyError
                ? 2_000
                : 1_000;
          await jobs.defer(job.id, new Date(now().getTime() + delay), safeError(error));
        } else if (isRetryableError(error) && job.attempts < job.maxAttempts) {
          const delay = backoffMs(job.attempts);
          await jobs.requeue(job.id, new Date(now().getTime() + delay), safeError(error));
        } else {
          await markTerminalFailure(job, error);
          await jobs.markFailed(job.id, safeError(error));
        }
      } finally {
        clearInterval(heartbeat);
      }
      return true;
    },
    syncAgent,
    syncContext,
    syncDocument,
    cleanupDocument,
    cleanupPendingUpload,
    cleanupAvatar,
  };
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function backoffMs(attempts: number) {
  return Math.min(60 * 60 * 1000, 2 ** Math.max(0, attempts - 1) * 5_000);
}

function safeError(error: unknown) {
  if (
    error instanceof RagStillProcessingError ||
    error instanceof ProviderDocumentMissingError ||
    error instanceof AvatarProjectionBusyError
  ) {
    return error.message;
  }
  if (error instanceof ElevenLabsProviderError) {
    if (error.statusCode === 429) return "ElevenLabs quota or rate limit reached";
    if (error.statusCode && error.statusCode >= 500) return "ElevenLabs is temporarily unavailable";
    return "ElevenLabs rejected the knowledge base operation";
  }
  return error instanceof Error ? error.message.slice(0, 300) : "Knowledge base synchronization failed";
}

function isRetryableError(error: unknown) {
  return isTransientElevenLabsError(error) || isTransientStorageError(error);
}

function isTransientStorageError(error: unknown) {
  if (error instanceof ObjectNotFoundError || error instanceof ObjectTooLargeError) return false;
  if (!isRecord(error)) return false;
  const metadata = isRecord(error.$metadata) ? error.$metadata : null;
  const statusCode = typeof metadata?.httpStatusCode === "number" ? metadata.httpStatusCode : null;
  return (
    Boolean(error.$retryable) ||
    error.name === "TimeoutError" ||
    error.name === "RequestTimeout" ||
    statusCode === 408 ||
    statusCode === 429 ||
    Boolean(statusCode && statusCode >= 500)
  );
}

function isProviderNotFound(error: unknown) {
  return error instanceof ElevenLabsProviderError && error.statusCode === 404;
}

async function ignoreProviderNotFound(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if (!isProviderNotFound(error)) throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
