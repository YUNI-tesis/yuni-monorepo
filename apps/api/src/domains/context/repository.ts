import { Prisma, type PrismaClient } from "@prisma/client";
import { OwnershipError, type PresignDocumentUploadInput } from "@yuni/domain";

export type AvatarContextRepository = ReturnType<typeof createAvatarContextRepository>;

export function createAvatarContextRepository(db: PrismaClient) {
  return {
    async getForOwner(ownerId: string, avatarId: string) {
      const avatar = await db.avatarAgent.findFirst({
        where: { id: avatarId, ownerId },
        include: {
          documents: {
            where: { deletedAt: null },
            include: { providerSync: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!avatar) throw new OwnershipError();
      return avatar;
    },

    async updateText(ownerId: string, avatarId: string, text: string, fingerprint: string) {
      return db.$transaction(async (tx) => {
        const avatar = await tx.avatarAgent.findFirst({ where: { id: avatarId, ownerId } });
        if (!avatar) throw new OwnershipError();
        const needsSync =
          avatar.context !== text ||
          avatar.providerContextSyncStatus !== "synced" ||
          avatar.providerContextFingerprint !== fingerprint;
        const updated = await tx.avatarAgent.update({
          where: { id: avatarId },
          data: {
            context: text,
            ...(needsSync
              ? {
                  providerContextSyncStatus: text ? ("pending" as const) : ("deleting" as const),
                  providerContextError: null,
                  providerSyncStatus: "syncing" as const,
                  providerSyncError: null,
                }
              : {}),
          },
        });
        if (!needsSync) return updated;
        const dedupeKey = `avatar-context:${avatarId}:${fingerprint}:${updated.updatedAt.getTime()}`;
        await tx.job.upsert({
          where: { dedupeKey },
          create: {
            ownerId,
            avatarAgentId: avatarId,
            type: "avatar_context_provider_sync",
            payload: { avatarId },
            dedupeKey,
            maxAttempts: 8,
          },
          update: {},
        });
        return updated;
      });
    },

    async createPendingDocument(
      ownerId: string,
      avatarId: string,
      documentId: string,
      storageKey: string,
      input: PresignDocumentUploadInput
    ) {
      return db.$transaction(async (tx) => {
        const avatar = await tx.avatarAgent.findFirst({ where: { id: avatarId, ownerId } });
        if (!avatar) throw new OwnershipError();
        return tx.document.create({
          data: {
            id: documentId,
            ownerId,
            avatarAgentId: avatarId,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            storageKey,
            status: "pending_upload",
          },
        });
      });
    },

    findDocumentForOwner(ownerId: string, documentId: string) {
      return db.document.findFirst({
        where: { id: documentId, ownerId },
        include: { providerSync: true },
      });
    },

    async confirmUpload(ownerId: string, documentId: string, etag: string | undefined) {
      return db.$transaction(async (tx) => {
        const document = await tx.document.findFirst({ where: { id: documentId, ownerId } });
        if (!document) throw new OwnershipError();
        if (document.deletedAt) throw new OwnershipError();
        if (document.uploadConfirmedAt) return document;
        const updated = await tx.document.update({
          where: { id: documentId },
          data: {
            status: "processing",
            uploadConfirmedAt: new Date(),
            storageEtag: etag ?? null,
            errorMessage: null,
            providerSync: {
              upsert: {
                create: { status: "pending" },
                update: { status: "pending", errorMessage: null },
              },
            },
          },
        });
        await tx.job.create({
          data: {
            ownerId,
            avatarAgentId: document.avatarAgentId,
            type: "document_provider_sync",
            payload: { documentId },
            dedupeKey: `document-sync:${documentId}:${etag ?? "confirmed"}`,
            maxAttempts: 8,
          },
        });
        return updated;
      });
    },

    async retry(ownerId: string, documentId: string) {
      return db.$transaction(async (tx) => {
        const document = await tx.document.findFirst({ where: { id: documentId, ownerId } });
        if (!document || document.deletedAt) throw new OwnershipError();
        if (document.status !== "failed" || !document.uploadConfirmedAt) {
          throw new DocumentStateConflictError("Only failed uploads can be retried");
        }
        const updated = await tx.document.update({
          where: { id: documentId },
          data: {
            status: "processing",
            errorMessage: null,
            providerSync: {
              upsert: {
                create: { status: "pending" },
                update: { status: "pending", errorMessage: null },
              },
            },
          },
        });
        await tx.job.create({
          data: {
            ownerId,
            avatarAgentId: document.avatarAgentId,
            type: "document_provider_sync",
            payload: { documentId },
            dedupeKey: `document-sync:${documentId}:retry:${Date.now()}`,
            maxAttempts: 8,
          },
        });
        return updated;
      });
    },

    async markDeleting(ownerId: string, documentId: string) {
      return db.$transaction(async (tx) => {
        const document = await tx.document.findFirst({
          where: { id: documentId, ownerId },
          include: { providerSync: true },
        });
        if (!document) throw new OwnershipError();
        if (document.deletedAt) return document;
        const updated = await tx.document.update({
          where: { id: documentId },
          data: {
            status: "deleting",
            deletedAt: new Date(),
            ...(document.providerSync
              ? { providerSync: { update: { status: "deleting" as const, errorMessage: null } } }
              : {}),
          },
          include: { providerSync: true },
        });
        await tx.job.create({
          data: {
            ownerId,
            avatarAgentId: document.avatarAgentId,
            type: "provider_document_cleanup",
            payload: { documentId },
            dedupeKey: `document-cleanup:${documentId}`,
            maxAttempts: 8,
          },
        });
        return updated;
      });
    },
  };
}

export class DocumentStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentStateConflictError";
  }
}

export type AvatarContextRecord = Prisma.AvatarAgentGetPayload<{
  include: { documents: { include: { providerSync: true } } };
}>;
