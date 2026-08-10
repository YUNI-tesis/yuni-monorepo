import type { Prisma, PrismaClient } from "@prisma/client";
import { OwnershipError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createAvatarActivityRepository(db: Db) {
  async function ensureOwnedAvatar(ownerId: string, avatarAgentId: string) {
    const avatar = await db.avatarAgent.findFirst({
      where: { id: avatarAgentId, ownerId },
      select: { id: true },
    });

    if (!avatar) throw new OwnershipError();
  }

  return {
    async listParticipants(ownerId: string, avatarAgentId: string) {
      await ensureOwnedAvatar(ownerId, avatarAgentId);

      const [grants, activity] = await Promise.all([
        db.accessGrant.findMany({
          where: { ownerId, avatarAgentId },
          select: {
            id: true,
            participantEmail: true,
            participantUserId: true,
            status: true,
            createdAt: true,
            participantUser: { select: { name: true } },
          },
        }),
        db.conversation.groupBy({
          by: ["accessGrantId"],
          where: {
            avatarAgentId,
            accessGrantId: { not: null },
            visibility: "private",
          },
          _count: { id: true },
          _max: { createdAt: true, lastMessageAt: true },
        }),
      ]);

      const activityByGrant = new Map(activity.map((item) => [item.accessGrantId, item]));

      return grants.map((grant) => {
        const aggregate = activityByGrant.get(grant.id);
        const candidates = [aggregate?._max.createdAt, aggregate?._max.lastMessageAt].filter(
          (value): value is Date => Boolean(value)
        );

        return {
          ...grant,
          participantName: grant.participantUser?.name ?? null,
          totalConversations: aggregate?._count.id ?? 0,
          lastActivityAt:
            candidates.length > 0 ? new Date(Math.max(...candidates.map((value) => value.getTime()))) : null,
        };
      });
    },

    async listConversations(
      ownerId: string,
      avatarAgentId: string,
      accessGrantId: string,
      options: { limit: number; cursor?: string }
    ) {
      await ensureOwnedAvatar(ownerId, avatarAgentId);

      const grant = await db.accessGrant.findFirst({
        where: { id: accessGrantId, ownerId, avatarAgentId },
        select: { id: true },
      });
      if (!grant) throw new OwnershipError();

      if (options.cursor) {
        const cursor = await db.conversation.findFirst({
          where: {
            id: options.cursor,
            avatarAgentId,
            accessGrantId,
            visibility: "private",
          },
          select: { id: true },
        });
        if (!cursor) return { invalidCursor: true as const, conversations: [] };
      }

      const conversations = await db.conversation.findMany({
        where: { avatarAgentId, accessGrantId, visibility: "private" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: options.limit + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          title: true,
          mode: true,
          status: true,
          createdAt: true,
          lastMessageAt: true,
          _count: {
            select: { messages: { where: { role: { in: ["user", "assistant"] } } } },
          },
        },
      });

      return { invalidCursor: false as const, conversations };
    },

    async findConversation(ownerId: string, avatarAgentId: string, conversationId: string) {
      await ensureOwnedAvatar(ownerId, avatarAgentId);

      return db.conversation.findFirst({
        where: {
          id: conversationId,
          avatarAgentId,
          accessGrantId: { not: null },
          accessGrant: { ownerId, avatarAgentId },
          visibility: "private",
        },
        select: {
          id: true,
          title: true,
          mode: true,
          status: true,
          createdAt: true,
          lastMessageAt: true,
          accessGrant: { select: { participantEmail: true } },
          messages: {
            where: { role: { in: ["user", "assistant"] } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, role: true, content: true, createdAt: true },
          },
        },
      });
    },
  };
}
