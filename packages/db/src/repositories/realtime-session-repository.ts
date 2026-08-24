import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateRealtimeSessionInput } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createRealtimeSessionRepository(db: Db) {
  return {
    create(input: CreateRealtimeSessionInput & { expiresAt?: Date; accessGrantId?: string }) {
      const data: Prisma.RealtimeSessionUncheckedCreateInput = {
        avatarAgentId: input.avatarAgentId,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.publicSessionId ? { publicSessionId: input.publicSessionId } : {}),
        ...(input.accessGrantId ? { accessGrantId: input.accessGrantId } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      };

      return db.realtimeSession.create({
        data,
      });
    },

    findPrivateForParticipant(participantUserId: string, realtimeSessionId: string) {
      return db.realtimeSession.findFirst({
        where: {
          id: realtimeSessionId,
          conversation: {
            ownerId: participantUserId,
            visibility: "private",
          },
        },
        include: {
          conversation: true,
        },
      });
    },

    markActive(id: string, providerSessionId?: string, providerSessionTokenCiphertext?: string) {
      return withTransaction(db, async (transaction) => {
        const transition = await transaction.realtimeSession.updateMany({
          where: {
            id,
            status: "connecting",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          data: {
            status: "active",
            ...(providerSessionId ? { providerSessionId } : {}),
            ...(providerSessionTokenCiphertext ? { providerSessionTokenCiphertext } : {}),
          },
        });
        if (transition.count === 0) return null;
        return transaction.realtimeSession.findUnique({ where: { id } });
      });
    },

    markEnded(id: string) {
      return db.realtimeSession.update({
        where: { id },
        data: { status: "ended", endedAt: new Date() },
      });
    },

    finalizePrivate(input: {
      realtimeSessionId: string;
      conversationId: string;
      transcript: Array<{ role: "user" | "assistant"; content: string }>;
      title: string;
    }) {
      const endedAt = new Date();
      return withTransaction(db, async (transaction) => {
        const transition = await transaction.realtimeSession.updateMany({
          where: {
            id: input.realtimeSessionId,
            conversationId: input.conversationId,
            status: { in: ["connecting", "active"] },
          },
          data: { status: "ended", endedAt },
        });

        if (transition.count === 0) {
          const current = await transaction.realtimeSession.findUnique({
            where: { id: input.realtimeSessionId },
            select: { id: true, conversationId: true, status: true, endedAt: true },
          });
          if (!current || current.conversationId !== input.conversationId || current.status !== "ended") {
            return null;
          }
          return { session: current, finalized: false as const };
        }

        if (input.transcript.length > 0) {
          await transaction.message.createMany({
            data: input.transcript.map((entry, index) => ({
              conversationId: input.conversationId,
              role: entry.role,
              content: entry.content,
              metadata: { source: "liveavatar_sdk" },
              createdAt: new Date(endedAt.getTime() + index),
            })),
          });
        }

        await transaction.conversation.update({
          where: { id: input.conversationId },
          data: {
            status: "ended",
            title: input.title,
            ...(input.transcript.length > 0
              ? { lastMessageAt: new Date(endedAt.getTime() + input.transcript.length - 1) }
              : {}),
          },
        });

        return {
          session: {
            id: input.realtimeSessionId,
            conversationId: input.conversationId,
            status: "ended" as const,
            endedAt,
          },
          finalized: true as const,
        };
      });
    },

    markProviderStopped(id: string) {
      return db.realtimeSession.updateMany({
        where: { id, providerStoppedAt: null },
        data: { providerStoppedAt: new Date(), providerSessionTokenCiphertext: null },
      });
    },

    expireSharedIfActive(id: string, conversationId: string | null) {
      const endedAt = new Date();
      return withTransaction(db, async (transaction) => {
        const transition = await transaction.realtimeSession.updateMany({
          where: { id, status: { in: ["connecting", "active"] } },
          data: { status: "ended", endedAt },
        });
        if (transition.count === 1 && conversationId) {
          await transaction.conversation.updateMany({
            where: { id: conversationId, status: "active" },
            data: { status: "ended" },
          });
        }
        return transition.count === 1;
      });
    },

    markErrored(id: string, errorMessage: string, providerSessionTokenCiphertext?: string) {
      return withTransaction(db, async (transaction) => {
        const transition = await transaction.realtimeSession.updateMany({
          where: { id, status: { in: ["connecting", "active"] } },
          data: {
            status: "errored",
            endedAt: new Date(),
            errorMessage,
            ...(providerSessionTokenCiphertext ? { providerSessionTokenCiphertext } : {}),
          },
        });
        if (transition.count === 0 && providerSessionTokenCiphertext) {
          await transaction.realtimeSession.updateMany({
            where: { id, providerStoppedAt: null },
            data: { providerSessionTokenCiphertext },
          });
        }
        return transition.count === 1;
      });
    },
  };
}

async function withTransaction<T>(
  db: Db,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if ("$transaction" in db) return db.$transaction(operation);
  return operation(db);
}
