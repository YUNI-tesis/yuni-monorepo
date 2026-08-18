import { createHash } from "node:crypto";
import type { PrismaClientInstance } from "@yuni/db";
import { createJobRepository } from "@yuni/db";
import { MAX_DOCUMENT_SIZE_BYTES, VoiceConfigSchema } from "@yuni/domain";
import type { ObjectStorage } from "@yuni/storage";
import {
  ElevenLabsProviderError,
  isTransientElevenLabsError,
  type ElevenLabsAgentProvider,
  type ElevenLabsKnowledgeBaseReference,
} from "@yuni/voice";

class RagStillProcessingError extends Error {
  constructor() {
    super("Knowledge base index is still processing");
    this.name = "RagStillProcessingError";
  }
}

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

  async function syncAgent(avatarId: string, includeDocumentId?: string) {
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
    const textReady =
      avatar.providerContextSyncStatus === "synced" && Boolean(avatar.providerContextDocumentId);
    if (textReady && avatar.providerContextDocumentId) {
      knowledgeBase.push({
        type: "text",
        name: `YUNI Context - ${avatar.name}`,
        id: avatar.providerContextDocumentId,
        usage_mode: "prompt",
      });
    }
    for (const document of avatar.documents) {
      const providerSync = document.providerSync;
      if (
        providerSync?.providerDocumentId &&
        (providerSync.status === "synced" || document.id === includeDocumentId)
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
    try {
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
    } catch (error) {
      await dependencies.db.avatarAgent.update({
        where: { id: avatarId },
        data: { providerSyncStatus: "failed", providerSyncError: safeError(error) },
      });
      throw error;
    }
  }

  async function syncContext(avatarId: string) {
    const avatar = await dependencies.db.avatarAgent.findUnique({ where: { id: avatarId } });
    if (!avatar) return;
    await dependencies.db.avatarAgent.update({
      where: { id: avatarId },
      data: {
        providerContextSyncStatus: avatar.context ? "syncing" : "deleting",
        providerContextError: null,
      },
    });

    try {
      if (!avatar.context.trim()) {
        await syncAgent(avatarId);
        if (avatar.providerContextDocumentId) {
          await ignoreProviderNotFound(() =>
            dependencies.provider.deleteKnowledgeBaseDocument(avatar.providerContextDocumentId!, true)
          );
        }
        await dependencies.db.avatarAgent.update({
          where: { id: avatarId },
          data: {
            providerContextDocumentId: null,
            providerContextSyncStatus: "synced",
            providerContextFingerprint: fingerprint(""),
            providerContextError: null,
            providerContextSyncedAt: now(),
          },
        });
        return;
      }

      let external;
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
        }
      } else {
        external = await dependencies.provider.createTextDocument(
          `YUNI Context - ${avatar.name}`,
          avatar.context
        );
      }
      await dependencies.db.avatarAgent.update({
        where: { id: avatarId },
        data: { providerContextDocumentId: external.id, providerContextSyncStatus: "syncing" },
      });
      const usableAt = now();
      await dependencies.db.avatarAgent.update({
        where: { id: avatarId },
        data: {
          providerContextSyncStatus: "synced",
          providerContextFingerprint: fingerprint(avatar.context),
          providerContextError: null,
          providerContextSyncedAt: usableAt,
          providerContextLastUsableAt: usableAt,
        },
      });
      await syncAgent(avatarId);
    } catch (error) {
      await dependencies.db.avatarAgent.update({
        where: { id: avatarId },
        data: { providerContextSyncStatus: "failed", providerContextError: safeError(error) },
      });
      throw error;
    }
  }

  async function syncDocument(documentId: string) {
    let document = await dependencies.db.document.findUnique({
      where: { id: documentId },
      include: { providerSync: true },
    });
    if (!document || document.deletedAt) return;
    if (!document.uploadConfirmedAt) throw new Error("Document upload is not confirmed");

    try {
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
          status: "indexing",
          ragStatus: "not_started",
          fingerprint: fingerprint(
            `${document.storageEtag ?? ""}:${document.sizeBytes}:${document.mimeType}`
          ),
        });
        document = await dependencies.db.document.findUniqueOrThrow({
          where: { id: documentId },
          include: { providerSync: true },
        });
      }

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
        throw new Error("Provider document disappeared and will be recreated");
      }

      if (ragStatus === "failed") throw new Error("Knowledge base indexing failed");
      if (ragStatus !== "ready") {
        await upsertDocumentSync(documentId, { status: "indexing", ragStatus: "processing" });
        throw new RagStillProcessingError();
      }

      await upsertDocumentSync(documentId, { status: "attaching", ragStatus: "ready" });
      await syncAgent(document.avatarAgentId, documentId);
      const usableAt = now();
      await dependencies.db.$transaction([
        dependencies.db.documentProviderSync.update({
          where: { documentId },
          data: {
            status: "synced",
            ragStatus: "ready",
            errorMessage: null,
            providerLastUsableAt: usableAt,
          },
        }),
        dependencies.db.document.update({
          where: { id: documentId },
          data: { status: "ready", errorMessage: null },
        }),
      ]);
    } catch (error) {
      if (!(error instanceof RagStillProcessingError)) {
        await dependencies.db.document.update({
          where: { id: documentId },
          data: { status: "failed", errorMessage: safeError(error) },
        });
        await upsertDocumentSync(documentId, { status: "failed", errorMessage: safeError(error) });
      }
      throw error;
    }
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
        if (avatarId) await syncContext(avatarId);
        return;
      case "document_provider_sync":
        if (documentId) await syncDocument(documentId);
        return;
      case "agent_provider_sync":
        if (avatarId) await syncAgent(avatarId);
        return;
      case "provider_document_cleanup":
        if (documentId) await cleanupDocument(documentId);
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
      await dependencies.db.avatarAgent.updateMany({
        where: { id: avatarId },
        data: { providerContextSyncStatus: "failed", providerContextError: errorMessage },
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
      try {
        await execute(job);
        await jobs.markDone(job.id);
      } catch (error) {
        const retryable =
          error instanceof RagStillProcessingError ||
          isTransientElevenLabsError(error) ||
          !(error instanceof ElevenLabsProviderError);
        if (retryable && job.attempts < job.maxAttempts) {
          const delay = error instanceof RagStillProcessingError ? 10_000 : backoffMs(job.attempts);
          await jobs.requeue(job.id, new Date(now().getTime() + delay), safeError(error));
        } else {
          await markTerminalFailure(job, error);
          await jobs.markFailed(job.id, safeError(error));
        }
      }
      return true;
    },
    syncAgent,
    syncContext,
    syncDocument,
    cleanupDocument,
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
  if (error instanceof RagStillProcessingError) return error.message;
  if (error instanceof ElevenLabsProviderError) {
    if (error.statusCode === 429) return "ElevenLabs quota or rate limit reached";
    if (error.statusCode && error.statusCode >= 500) return "ElevenLabs is temporarily unavailable";
    return "ElevenLabs rejected the knowledge base operation";
  }
  return error instanceof Error ? error.message.slice(0, 300) : "Knowledge base synchronization failed";
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
