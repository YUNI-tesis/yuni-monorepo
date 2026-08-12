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

    createSession(input: {
      shareLinkId: string;
      avatarAgentId: string;
      participantEmail: string;
      participantUserId?: string;
      consentedAt: Date;
      expiresAt: Date;
    }) {
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const publicSession = await tx.publicSession.create({
          data: {
            shareLinkId: input.shareLinkId,
            avatarAgentId: input.avatarAgentId,
            participantEmail: input.participantEmail,
            ...(input.participantUserId ? { participantUserId: input.participantUserId } : {}),
            consentedAt: input.consentedAt,
            expiresAt: input.expiresAt,
          },
        });
        const conversation = await tx.conversation.create({
          data: {
            avatarAgentId: input.avatarAgentId,
            shareLinkId: input.shareLinkId,
            publicSessionId: publicSession.id,
            participantEmail: input.participantEmail,
            visibility: "public",
            mode: "voice",
          },
        });
        const realtimeSession = await tx.realtimeSession.create({
          data: {
            avatarAgentId: input.avatarAgentId,
            publicSessionId: publicSession.id,
            conversationId: conversation.id,
          },
        });

        return { publicSession, conversation, realtimeSession };
      });
    },

    markPrepared(input: {
      publicSessionId: string;
      realtimeSessionId: string;
      providerSessionId?: string;
      providerSessionTokenCiphertext: string;
    }) {
      return db.realtimeSession.update({
        where: { id: input.realtimeSessionId },
        data: {
          ...(input.providerSessionId ? { providerSessionId: input.providerSessionId } : {}),
          providerSessionTokenCiphertext: input.providerSessionTokenCiphertext,
        },
      });
    },

    findForStartConfirmation(publicSessionId: string) {
      return db.publicSession.findUnique({
        where: { id: publicSessionId },
        include: {
          shareLink: { select: { id: true, isEnabled: true } },
          avatarAgent: { select: { status: true } },
          realtimeSessions: { orderBy: { startedAt: "desc" }, take: 1 },
        },
      });
    },

    markStarted(input: { publicSessionId: string; realtimeSessionId: string; shareLinkId: string }) {
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const transition = await tx.realtimeSession.updateMany({
          where: {
            id: input.realtimeSessionId,
            publicSessionId: input.publicSessionId,
            status: "connecting",
          },
          data: { status: "active" },
        });
        if (transition.count === 1) {
          await tx.shareLink.update({
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
    }) {
      const endedAt = new Date();
      return db.$transaction([
        db.realtimeSession.update({
          where: { id: input.realtimeSessionId },
          data: {
            status: "errored",
            endedAt,
            errorMessage: input.errorMessage,
          },
        }),
        db.conversation.update({
          where: { id: input.conversationId },
          data: { status: "ended" },
        }),
        db.publicSession.update({
          where: { id: input.publicSessionId },
          data: { status: "errored", endedAt },
        }),
      ]);
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

    expireIfActive(input: { publicSessionId: string; conversationId: string; realtimeSessionId: string }) {
      const endedAt = new Date();
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const current = await tx.publicSession.findUnique({
          where: { id: input.publicSessionId },
          select: { status: true },
        });
        if (!current || current.status !== "active") return false;
        await tx.conversation.update({
          where: { id: input.conversationId },
          data: { status: "ended" },
        });
        await tx.realtimeSession.update({
          where: { id: input.realtimeSessionId },
          data: { status: "ended", endedAt },
        });
        await tx.publicSession.update({
          where: { id: input.publicSessionId },
          data: { status: "ended", endedAt },
        });
        return true;
      });
    },

    async listExpiredForCleanup(now: Date, limit = 50) {
      const sessions = await db.publicSession.findMany({
        where: { status: "active", expiresAt: { lte: now } },
        orderBy: { expiresAt: "asc" },
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
      return sessions.flatMap((session) => {
        const realtimeSession = session.realtimeSessions[0];
        return session.conversation && realtimeSession
          ? [
              {
                publicSessionId: session.id,
                conversationId: session.conversation.id,
                realtimeSessionId: realtimeSession.id,
                providerSessionTokenCiphertext: realtimeSession.providerSessionTokenCiphertext,
              },
            ]
          : [];
      });
    },

    async listExpiredForProviderStop(now: Date, limit = 50) {
      const sessions = await db.publicSession.findMany({
        where: {
          OR: [
            { status: "active", expiresAt: { lte: now } },
            { status: { in: ["ended", "errored"] } },
          ],
          realtimeSessions: {
            some: {
              status: { in: ["connecting", "active", "ended", "errored"] },
              providerStoppedAt: null,
              providerSessionTokenCiphertext: { not: null },
            },
          },
        },
        orderBy: { expiresAt: "asc" },
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
