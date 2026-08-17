import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export function createCreatorDashboardRepository(db: Db) {
  return {
    async getSummaryData(ownerId: string, sessionsFrom: Date) {
      const owner = await db.user.findUnique({
        where: { id: ownerId },
        select: {
          email: true,
          avatarAgents: {
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: {
              id: true,
              name: true,
              providerSyncStatus: true,
            },
          },
        },
      });

      if (!owner) {
        return { avatars: [], grants: [], conversations: [] };
      }

      const participantConversationWhere: Prisma.ConversationWhereInput = {
        avatarAgent: { ownerId },
        participantEmail: { not: null },
        NOT: { participantEmail: owner.email },
        OR: [
          { visibility: "public" },
          { visibility: "private", accessGrantId: { not: null } },
        ],
      };

      const [grants, conversations] = await Promise.all([
        db.accessGrant.findMany({
          where: { ownerId, status: "active" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            avatarAgentId: true,
            participantEmail: true,
            createdAt: true,
          },
        }),
        db.conversation.findMany({
          where: participantConversationWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            avatarAgentId: true,
            participantEmail: true,
            mode: true,
            status: true,
            createdAt: true,
            lastMessageAt: true,
            _count: {
              select: {
                messages: { where: { role: "user" } },
              },
            },
            realtimeSessions: {
              where: { startedAt: { gte: sessionsFrom } },
              orderBy: [{ startedAt: "desc" }, { id: "desc" }],
              select: {
                id: true,
                status: true,
                startedAt: true,
                endedAt: true,
              },
            },
          },
        }),
      ]);

      return {
        avatars: owner.avatarAgents,
        grants,
        conversations,
      };
    },
  };
}
