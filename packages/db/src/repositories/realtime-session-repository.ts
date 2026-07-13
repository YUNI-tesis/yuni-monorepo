import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateRealtimeSessionInput } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createRealtimeSessionRepository(db: Db) {
  return {
    create(input: CreateRealtimeSessionInput) {
      const data: Prisma.RealtimeSessionUncheckedCreateInput = {
        avatarAgentId: input.avatarAgentId,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.publicSessionId ? { publicSessionId: input.publicSessionId } : {}),
      };

      return db.realtimeSession.create({
        data,
      });
    },

    findPrivateForOwner(ownerId: string, realtimeSessionId: string) {
      return db.realtimeSession.findFirst({
        where: {
          id: realtimeSessionId,
          conversation: {
            ownerId,
            visibility: "private",
          },
        },
        include: {
          conversation: true,
        },
      });
    },

    markActive(id: string, providerSessionId?: string) {
      return db.realtimeSession.update({
        where: { id },
        data: {
          status: "active",
          ...(providerSessionId ? { providerSessionId } : {}),
        },
      });
    },

    markEnded(id: string) {
      return db.realtimeSession.update({
        where: { id },
        data: { status: "ended", endedAt: new Date() },
      });
    },

    markErrored(id: string, errorMessage: string) {
      return db.realtimeSession.update({
        where: { id },
        data: { status: "errored", endedAt: new Date(), errorMessage },
      });
    },
  };
}
