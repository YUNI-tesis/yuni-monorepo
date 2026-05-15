import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateDocumentInput } from "@yuni/domain";
import { OwnershipError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createDocumentRepository(db: Db) {
  return {
    async createUploaded(ownerId: string, avatarAgentId: string, input: CreateDocumentInput) {
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

    async listForAvatar(ownerId: string, avatarAgentId: string) {
      const avatar = await db.avatarAgent.findFirst({ where: { id: avatarAgentId, ownerId } });
      if (!avatar) throw new OwnershipError();

      return db.document.findMany({
        where: { ownerId, avatarAgentId },
        orderBy: { createdAt: "desc" },
      });
    },

    markIngesting(documentId: string) {
      return db.document.update({
        where: { id: documentId },
        data: { status: "ingesting", errorMessage: null },
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

    async deleteForOwner(ownerId: string, documentId: string) {
      const current = await db.document.findFirst({ where: { id: documentId, ownerId } });
      if (!current) throw new OwnershipError();

      return db.document.delete({ where: { id: documentId } });
    },
  };
}
