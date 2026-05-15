import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppendMessageInput } from "@yuni/domain";

type Db = PrismaClient;

export function createMessageRepository(db: Db) {
  return {
    async append(conversationId: string, input: AppendMessageInput) {
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const data: Prisma.MessageUncheckedCreateInput = {
          conversationId,
          role: input.role,
          content: input.content,
          ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonObject } : {}),
        };

        const message = await tx.message.create({
          data,
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: message.createdAt },
        });

        return message;
      });
    },

    listByConversation(conversationId: string) {
      return db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
      });
    },
  };
}
