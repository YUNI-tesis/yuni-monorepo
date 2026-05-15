import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateDocumentChunkInput } from "@yuni/domain";

type Db = PrismaClient;

export function createDocumentChunkRepository(db: Db) {
  return {
    async replaceChunks(documentId: string, avatarAgentId: string, chunks: CreateDocumentChunkInput[]) {
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.documentChunk.deleteMany({ where: { documentId } });

        if (chunks.length === 0) return [];

        const data: Prisma.DocumentChunkCreateManyInput[] = chunks.map((chunk) => ({
          documentId,
          avatarAgentId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          ...(chunk.embedding ? { embedding: chunk.embedding as Prisma.InputJsonObject } : {}),
          ...(chunk.tokenCount ? { tokenCount: chunk.tokenCount } : {}),
        }));

        await tx.documentChunk.createMany({ data });

        return tx.documentChunk.findMany({
          where: { documentId },
          orderBy: { chunkIndex: "asc" },
        });
      });
    },

    listForAvatar(avatarAgentId: string) {
      return db.documentChunk.findMany({
        where: { avatarAgentId },
        orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
      });
    },

    deleteByDocument(documentId: string) {
      return db.documentChunk.deleteMany({ where: { documentId } });
    },
  };
}
