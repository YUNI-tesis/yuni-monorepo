import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient;

export function createPublicSessionRepository(db: Db) {
  return {
    resolveEnabledLink(slug: string) {
      return db.shareLink.findFirst({
        where: {
          slug,
          isEnabled: true,
          avatarAgent: { status: "active" },
        },
        include: { avatarAgent: true },
      });
    },

    async findUserByEmail(email: string) {
      return db.user.findUnique({
        where: { email },
        select: { id: true },
      });
    },

    markPrepared(input: {
      publicSessionId: string;
      realtimeSessionId: string;
      providerSessionId?: string;
      providerSessionTokenCiphertext: string;
    }) {
      return db.$transaction(async (transaction) => {
        const sessions = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "PublicSession"
          WHERE "id" = ${input.publicSessionId}
            AND "status" = 'active'::"PublicSessionStatus"
            AND "expiresAt" > NOW()
          FOR UPDATE
        `;
        if (!sessions[0]) return false;

        const transition = await transaction.realtimeSession.updateMany({
          where: {
            id: input.realtimeSessionId,
            publicSessionId: input.publicSessionId,
            status: "connecting",
          },
          data: {
            ...(input.providerSessionId ? { providerSessionId: input.providerSessionId } : {}),
            providerSessionTokenCiphertext: input.providerSessionTokenCiphertext,
          },
        });
        return transition.count === 1;
      });
    },

    findForStartConfirmation(publicSessionId: string) {
      return db.publicSession.findUnique({
        where: { id: publicSessionId },
        select: {
          shareLinkId: true,
          status: true,
          expiresAt: true,
          realtimeSessions: { orderBy: { startedAt: "desc" }, take: 1 },
        },
      });
    },

    markStarted(input: { publicSessionId: string; realtimeSessionId: string; shareLinkId: string }) {
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const sessions = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "PublicSession"
          WHERE "id" = ${input.publicSessionId}
            AND ("shareLinkId" = ${input.shareLinkId} OR "shareLinkId" IS NULL)
            AND "status" = 'active'::"PublicSessionStatus"
            AND "expiresAt" > NOW()
          FOR UPDATE
        `;
        if (!sessions[0]) return false;

        const transition = await tx.realtimeSession.updateMany({
          where: {
            id: input.realtimeSessionId,
            publicSessionId: input.publicSessionId,
            status: "connecting",
          },
          data: { status: "active" },
        });
        if (transition.count === 1) {
          await tx.shareLink.updateMany({
            where: { id: input.shareLinkId },
            data: { lastUsedAt: new Date() },
          });
        }
        return transition.count === 1;
      });
    },

    markStartFailed(input: {
      publicSessionId: string;
      realtimeSessionId: string;
      conversationId: string;
      errorMessage: string;
      providerSessionTokenCiphertext?: string;
    }) {
      const endedAt = new Date();
      return db.$transaction(async (transaction) => {
        const transition = await transaction.realtimeSession.updateMany({
          where: {
            id: input.realtimeSessionId,
            publicSessionId: input.publicSessionId,
            status: { in: ["connecting", "active"] },
          },
          data: {
            status: "errored",
            endedAt,
            errorMessage: input.errorMessage,
            ...(input.providerSessionTokenCiphertext
              ? { providerSessionTokenCiphertext: input.providerSessionTokenCiphertext }
              : {}),
          },
        });

        if (transition.count === 0) {
          if (input.providerSessionTokenCiphertext) {
            await transaction.realtimeSession.updateMany({
              where: { id: input.realtimeSessionId, providerStoppedAt: null },
              data: { providerSessionTokenCiphertext: input.providerSessionTokenCiphertext },
            });
          }
          return false;
        }

        await Promise.all([
          transaction.conversation.updateMany({
            where: { id: input.conversationId, status: "active" },
            data: { status: "ended" },
          }),
          transaction.publicSession.updateMany({
            where: { id: input.publicSessionId, status: "active" },
            data: { status: "errored", endedAt },
          }),
        ]);
        return true;
      });
    },

    findForEnd(publicSessionId: string) {
      return db.publicSession.findUnique({
        where: { id: publicSessionId },
        include: {
          avatarAgent: { select: { name: true } },
          conversation: true,
          realtimeSessions: { orderBy: { startedAt: "desc" }, take: 1 },
        },
      });
    },

    finalize(input: {
      publicSessionId: string;
      conversationId: string;
      realtimeSessionId: string;
      transcript: Array<{ role: "user" | "assistant"; content: string }>;
      title?: string;
    }) {
      const endedAt = new Date();
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const claimed = await tx.publicSession.updateMany({
          where: { id: input.publicSessionId, status: "active" },
          data: { status: "ended", endedAt },
        });
        if (claimed.count === 0) {
          const current = await tx.publicSession.findUnique({
            where: { id: input.publicSessionId },
            select: { status: true, endedAt: true },
          });
          if (!current || current.status !== "ended") return null;
          return {
            session: { id: input.publicSessionId, status: current.status, endedAt: current.endedAt },
            finalized: false,
          };
        }
        if (input.transcript.length) {
          await tx.message.createMany({
            data: input.transcript.map((entry, index) => ({
              conversationId: input.conversationId,
              role: entry.role,
              content: entry.content,
              metadata: { source: "liveavatar_sdk", public: true },
              createdAt: new Date(endedAt.getTime() + index),
            })),
          });
        }
        await tx.conversation.update({
          where: { id: input.conversationId },
          data: {
            status: "ended",
            ...(input.transcript.length
              ? { lastMessageAt: new Date(endedAt.getTime() + input.transcript.length - 1) }
              : {}),
            ...(input.title ? { title: input.title } : {}),
          },
        });
        await tx.realtimeSession.update({
          where: { id: input.realtimeSessionId },
          data: { status: "ended", endedAt },
        });
        return {
          session: { id: input.publicSessionId, status: "ended" as const, endedAt },
          finalized: true,
        };
      });
    },

    updateConversationTitleIfEnded(conversationId: string, title: string) {
      return db.conversation.updateMany({
        where: { id: conversationId, status: "ended" },
        data: { title },
      });
    },

    markProviderStopped(realtimeSessionId: string) {
      return db.realtimeSession.updateMany({
        where: { id: realtimeSessionId, providerStoppedAt: null },
        data: { providerStoppedAt: new Date(), providerSessionTokenCiphertext: null },
      });
    },

    expireIfActive(input: {
      publicSessionId: string;
      conversationId: string | null;
      realtimeSessionId: string | null;
    }) {
      const endedAt = new Date();
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const claimed = await tx.publicSession.updateMany({
          where: { id: input.publicSessionId, status: "active" },
          data: { status: "ended", endedAt },
        });
        if (claimed.count === 0) return false;
        if (input.conversationId) {
          await tx.conversation.updateMany({
            where: { id: input.conversationId, status: "active" },
            data: { status: "ended" },
          });
        }
        if (input.realtimeSessionId) {
          await tx.realtimeSession.updateMany({
            where: { id: input.realtimeSessionId, status: { in: ["connecting", "active"] } },
            data: { status: "ended", endedAt },
          });
        }
        return true;
      });
    },

    async listExpiredForCleanup(now: Date, limit = 50, afterId?: string) {
      const sessions = await db.publicSession.findMany({
        where: {
          ...(afterId ? { id: { gt: afterId } } : {}),
          status: "active",
          expiresAt: { lte: now },
        },
        orderBy: { id: "asc" },
        take: limit,
        include: {
          conversation: { select: { id: true } },
          realtimeSessions: {
            where: { status: { in: ["connecting", "active"] } },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { id: true, providerSessionTokenCiphertext: true },
          },
        },
      });
      return sessions.map((session) => {
        const realtimeSession = session.realtimeSessions[0];
        return {
          publicSessionId: session.id,
          conversationId: session.conversation?.id ?? null,
          realtimeSessionId: realtimeSession?.id ?? null,
        };
      });
    },

    async listExpiredForProviderStop(now: Date, limit = 50, afterId?: string) {
      const sessions = await db.publicSession.findMany({
        where: {
          ...(afterId ? { id: { gt: afterId } } : {}),
          OR: [{ status: "active", expiresAt: { lte: now } }, { status: { in: ["ended", "errored"] } }],
          realtimeSessions: {
            some: {
              status: { in: ["connecting", "active", "ended", "errored"] },
              providerStoppedAt: null,
              providerSessionTokenCiphertext: { not: null },
            },
          },
        },
        orderBy: { id: "asc" },
        take: limit,
        include: {
          realtimeSessions: {
            where: {
              status: { in: ["connecting", "active", "ended", "errored"] },
              providerStoppedAt: null,
              providerSessionTokenCiphertext: { not: null },
            },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { id: true, providerSessionTokenCiphertext: true },
          },
        },
      });
      return sessions.flatMap((session) => {
        const realtimeSession = session.realtimeSessions[0];
        return realtimeSession?.providerSessionTokenCiphertext
          ? [
              {
                publicSessionId: session.id,
                realtimeSessionId: realtimeSession.id,
                providerSessionTokenCiphertext: realtimeSession.providerSessionTokenCiphertext,
              },
            ]
          : [];
      });
    },
  };
}
