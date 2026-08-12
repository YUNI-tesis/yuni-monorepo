import type { Prisma, PrismaClient } from "@prisma/client";
import { OwnershipError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createAvatarActivityRepository(db: Db) {
  async function ensureOwnedAvatar(ownerId: string, avatarAgentId: string) {
    const avatar = await db.avatarAgent.findFirst({
      where: { id: avatarAgentId, ownerId },
      select: { id: true, owner: { select: { email: true } } },
    });
    if (!avatar) throw new OwnershipError();
    return avatar;
  }

  return {
    async listParticipants(ownerId: string, avatarAgentId: string) {
      const avatar = await ensureOwnedAvatar(ownerId, avatarAgentId);
      const [grants, activity] = await Promise.all([
        db.accessGrant.findMany({
          where: { ownerId, avatarAgentId },
          select: {
            participantEmail: true,
            participantUserId: true,
            status: true,
            createdAt: true,
            participantUser: { select: { name: true } },
          },
        }),
        db.conversation.groupBy({
          by: ["participantEmail", "visibility"],
          where: {
            avatarAgentId,
            participantEmail: { not: null },
            NOT: { participantEmail: avatar.owner.email },
            OR: [
              { visibility: "public" },
              { visibility: "private", accessGrantId: { not: null } },
            ],
          },
          _count: { id: true },
          _max: { createdAt: true, lastMessageAt: true },
        }),
      ]);

      const emails = new Set<string>();
      grants.forEach((grant) => emails.add(grant.participantEmail));
      activity.forEach((item) => item.participantEmail && emails.add(item.participantEmail));
      const linkedPublicSessions = await db.publicSession.findMany({
        where: {
          avatarAgentId,
          participantEmail: { in: [...emails] },
          participantUserId: { not: null },
        },
        select: {
          participantEmail: true,
          participantUser: { select: { name: true } },
        },
      });
      const publicNames = new Map(
        linkedPublicSessions.flatMap((session) =>
          session.participantEmail
            ? [[session.participantEmail, session.participantUser?.name ?? null] as const]
            : []
        )
      );

      return [...emails].map((participantEmail) => {
        const grant = grants.find((item) => item.participantEmail === participantEmail) ?? null;
        const records = activity.filter((item) => item.participantEmail === participantEmail);
        const dates = records
          .flatMap((item) => [item._max.createdAt, item._max.lastMessageAt])
          .filter((value): value is Date => Boolean(value));
        const hasGrantActivity = records.some((item) => item.visibility === "private");
        const hasPublicActivity = records.some((item) => item.visibility === "public");

        return {
          participantEmail,
          participantUserId: grant?.participantUserId ?? null,
          participantName: grant?.participantUser?.name ?? publicNames.get(participantEmail) ?? null,
          grantStatus: grant?.status ?? null,
          grantCreatedAt: grant?.createdAt ?? null,
          origins: [
            ...(grant || hasGrantActivity ? (["access_grant"] as const) : []),
            ...(hasPublicActivity ? (["public_link"] as const) : []),
          ],
          totalConversations: records.reduce((total, item) => total + item._count.id, 0),
          lastActivityAt: dates.length
            ? new Date(Math.max(...dates.map((value) => value.getTime())))
            : null,
        };
      });
    },

    async listConversations(
      ownerId: string,
      avatarAgentId: string,
      participantEmail: string,
      options: { limit: number; cursor?: string }
    ) {
      const avatar = await ensureOwnedAvatar(ownerId, avatarAgentId);
      if (participantEmail === avatar.owner.email) throw new OwnershipError();
      const participantExists = await hasParticipant(db, ownerId, avatarAgentId, participantEmail);
      if (!participantExists) throw new OwnershipError();

      const where = participantConversationWhere(avatarAgentId, participantEmail);
      if (options.cursor) {
        const cursor = await db.conversation.findFirst({
          where: { id: options.cursor, ...where },
          select: { id: true },
        });
        if (!cursor) return { invalidCursor: true as const, conversations: [] };
      }

      const conversations = await db.conversation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: options.limit + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          title: true,
          mode: true,
          status: true,
          visibility: true,
          createdAt: true,
          lastMessageAt: true,
          shareLink: { select: { name: true } },
          _count: { select: { messages: { where: { role: { in: ["user", "assistant"] } } } } },
        },
      });
      return { invalidCursor: false as const, conversations };
    },

    async findConversation(ownerId: string, avatarAgentId: string, conversationId: string) {
      const avatar = await ensureOwnedAvatar(ownerId, avatarAgentId);
      return db.conversation.findFirst({
        where: {
          id: conversationId,
          avatarAgentId,
          participantEmail: { not: null },
          NOT: { participantEmail: avatar.owner.email },
          OR: [
            { visibility: "public" },
            { visibility: "private", accessGrant: { ownerId, avatarAgentId } },
          ],
        },
        select: {
          id: true,
          title: true,
          mode: true,
          status: true,
          visibility: true,
          participantEmail: true,
          createdAt: true,
          lastMessageAt: true,
          shareLink: { select: { name: true } },
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

function participantConversationWhere(avatarAgentId: string, participantEmail: string) {
  return {
    avatarAgentId,
    participantEmail,
    OR: [
      { visibility: "public" as const },
      { visibility: "private" as const, accessGrantId: { not: null } },
    ],
  };
}

async function hasParticipant(
  db: Db,
  ownerId: string,
  avatarAgentId: string,
  participantEmail: string
) {
  const [grant, conversation] = await Promise.all([
    db.accessGrant.findFirst({
      where: { ownerId, avatarAgentId, participantEmail },
      select: { id: true },
    }),
    db.conversation.findFirst({
      where: participantConversationWhere(avatarAgentId, participantEmail),
      select: { id: true },
    }),
  ]);
  return Boolean(grant || conversation);
}
