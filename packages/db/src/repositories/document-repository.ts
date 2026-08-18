import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateDocumentInput } from "@yuni/domain";
import { OwnershipError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createDocumentRepository(db: Db) {
  return {
    async createPendingUpload(ownerId: string, avatarAgentId: string, input: CreateDocumentInput) {
      const avatar = await db.avatarAgent.findFirst({ where: { id: avatarAgentId, ownerId } });
      if (!avatar) throw new OwnershipError();

      return db.document.create({
        data: {
          ownerId,
          avatarAgentId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          storageKey: input.storageKey,
        },
      });
    },

    createUploaded(ownerId: string, avatarAgentId: string, input: CreateDocumentInput) {
      return this.createPendingUpload(ownerId, avatarAgentId, input);
    },

    async listForAvatar(ownerId: string, avatarAgentId: string) {
      const avatar = await db.avatarAgent.findFirst({ where: { id: avatarAgentId, ownerId } });
      if (!avatar) throw new OwnershipError();

      return db.document.findMany({
        where: { ownerId, avatarAgentId, deletedAt: null },
        include: { providerSync: true },
        orderBy: { createdAt: "desc" },
      });
    },

    findByIdForOwner(ownerId: string, documentId: string) {
      return db.document.findFirst({
        where: { id: documentId, ownerId },
        include: { providerSync: true },
      });
    },

    findByIdInternal(documentId: string) {
      return db.document.findUnique({
        where: { id: documentId },
        include: { providerSync: true, avatarAgent: true },
      });
    },

    confirmUpload(documentId: string, etag?: string) {
      return db.document.update({
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
    },

    markIngesting(documentId: string) {
      return db.document.update({
        where: { id: documentId },
        data: { status: "processing", errorMessage: null },
      });
    },

    markReady(documentId: string) {
      return db.document.update({
        where: { id: documentId },
        data: { status: "ready", errorMessage: null },
      });
    },

    markFailed(documentId: string, errorMessage: string) {
      return db.document.update({
        where: { id: documentId },
        data: { status: "failed", errorMessage },
      });
    },

    updateProviderSync(
      documentId: string,
      data: {
        providerDocumentId?: string | null;
        status?:
          | "pending"
          | "uploading"
          | "indexing"
          | "attaching"
          | "synced"
          | "failed"
          | "deleting"
          | "deleted";
        ragStatus?: string | null;
        fingerprint?: string | null;
        errorMessage?: string | null;
        providerLastUsableAt?: Date | null;
      }
    ) {
      return db.documentProviderSync.upsert({
        where: { documentId },
        create: { documentId, ...data },
        update: data,
      });
    },

    async markDeletingForOwner(ownerId: string, documentId: string) {
      const current = await db.document.findFirst({ where: { id: documentId, ownerId } });
      if (!current) throw new OwnershipError();
      if (current.deletedAt) return current;
      return db.document.update({
        where: { id: documentId },
        data: {
          status: "deleting",
          deletedAt: new Date(),
          providerSync: {
            update: { status: "deleting", errorMessage: null },
          },
        },
      });
    },

    deleteInternal(documentId: string) {
      return db.document.delete({ where: { id: documentId } });
    },

    async deleteForOwner(ownerId: string, documentId: string) {
      const current = await db.document.findFirst({ where: { id: documentId, ownerId } });
      if (!current) throw new OwnershipError();

      return db.document.delete({ where: { id: documentId } });
    },
  };
}
