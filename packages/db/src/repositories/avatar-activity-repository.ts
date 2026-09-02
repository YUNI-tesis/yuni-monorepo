import { Prisma, type PrismaClient } from "@prisma/client";
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
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
            avatarGroupId: null,
            participantEmail: { not: null },
            OR: [
              {
                visibility: "public",
                shareLinkId: { not: null },
                shareLink: { ownerId, avatarAgentId },
              },
              { visibility: "private", accessGrant: { ownerId, avatarAgentId } },
            ],
          },
          _count: { id: true },
          _max: { createdAt: true, lastMessageAt: true },
        }),
      ]);

      const ownerEmail = normalizeParticipantEmail(avatar.owner.email);
      const emails = new Set<string>();
      const rawEmails = new Set<string>();
      const grantsByEmail = new Map<string, (typeof grants)[number]>();
      for (const grant of grants) {
        const email = normalizeParticipantEmail(grant.participantEmail);
        if (!email || email === ownerEmail) continue;
        emails.add(email);
        rawEmails.add(grant.participantEmail);
        const current = grantsByEmail.get(email);
        if (!current || preferGrant(grant, current)) grantsByEmail.set(email, grant);
      }

      const activityByEmail = new Map<string, typeof activity>();
      for (const record of activity) {
        if (!record.participantEmail) continue;
        const email = normalizeParticipantEmail(record.participantEmail);
        if (!email || email === ownerEmail) continue;
        emails.add(email);
        rawEmails.add(record.participantEmail);
        const records = activityByEmail.get(email);
        if (records) records.push(record);
        else activityByEmail.set(email, [record]);
      }
      const linkedPublicSessions = await db.publicSession.findMany({
        where: {
          avatarAgentId,
          participantEmail: { in: [...rawEmails] },
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
            ? [
                [
                  normalizeParticipantEmail(session.participantEmail),
                  session.participantUser?.name ?? null,
                ] as const,
              ]
            : []
        )
      );

      return [...emails].map((participantEmail) => {
        const grant = grantsByEmail.get(participantEmail) ?? null;
        const records = activityByEmail.get(participantEmail) ?? [];
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
          lastActivityAt: dates.length ? new Date(Math.max(...dates.map((value) => value.getTime()))) : null,
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
      const normalizedEmail = normalizeParticipantEmail(participantEmail);
      if (!normalizedEmail || normalizedEmail === normalizeParticipantEmail(avatar.owner.email)) {
        throw new OwnershipError();
      }
      const participantExists = await hasParticipant(db, ownerId, avatarAgentId, normalizedEmail);
      if (!participantExists) throw new OwnershipError();

      const emailVariants = await listConversationEmailVariants(db, ownerId, avatarAgentId, normalizedEmail);
      const where = participantConversationWhere(avatarAgentId, emailVariants, ownerId);
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
      const conversation = await db.conversation.findFirst({
        where: {
          id: conversationId,
          avatarAgentId,
          avatarGroupId: null,
          participantEmail: { not: null },
          NOT: { participantEmail: avatar.owner.email },
          OR: [
            {
              visibility: "public",
              shareLinkId: { not: null },
              shareLink: { ownerId, avatarAgentId },
            },
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
      if (
        !conversation?.participantEmail ||
        normalizeParticipantEmail(conversation.participantEmail) ===
          normalizeParticipantEmail(avatar.owner.email)
      ) {
        return null;
      }
      return conversation;
    },
  };
}

function participantConversationWhere(avatarAgentId: string, participantEmails: string[], ownerId: string) {
  return {
    avatarAgentId,
    avatarGroupId: null,
    participantEmail: { in: participantEmails },
    OR: [
      {
        visibility: "public" as const,
        shareLinkId: { not: null },
        shareLink: { ownerId, avatarAgentId },
      },
      { visibility: "private" as const, accessGrant: { ownerId, avatarAgentId } },
    ],
  };
}

async function hasParticipant(db: Db, ownerId: string, avatarAgentId: string, participantEmail: string) {
  const [grants, conversations] = await Promise.all([
    db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT access_grant."id"
      FROM "AccessGrant" AS access_grant
      WHERE access_grant."ownerId" = ${ownerId}
        AND access_grant."avatarAgentId" = ${avatarAgentId}
        AND LOWER(BTRIM(access_grant."participantEmail")) = ${participantEmail}
      LIMIT 1
    `),
    db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT conversation."id"
      FROM "Conversation" AS conversation
      WHERE conversation."avatarAgentId" = ${avatarAgentId}
        AND conversation."avatarGroupId" IS NULL
        AND LOWER(BTRIM(conversation."participantEmail")) = ${participantEmail}
        AND (
          (
            conversation."visibility" = 'public'::"ConversationVisibility"
            AND conversation."shareLinkId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "ShareLink" AS share_link
              WHERE share_link."id" = conversation."shareLinkId"
                AND share_link."ownerId" = ${ownerId}
                AND share_link."avatarAgentId" = ${avatarAgentId}
            )
          )
          OR EXISTS (
            SELECT 1
            FROM "AccessGrant" AS access_grant
            WHERE access_grant."id" = conversation."accessGrantId"
              AND access_grant."ownerId" = ${ownerId}
              AND access_grant."avatarAgentId" = ${avatarAgentId}
          )
        )
      LIMIT 1
    `),
  ]);
  return Boolean(grants[0] || conversations[0]);
}

async function listConversationEmailVariants(
  db: Db,
  ownerId: string,
  avatarAgentId: string,
  participantEmail: string
) {
  const rows = await db.$queryRaw<Array<{ participantEmail: string }>>(Prisma.sql`
    SELECT DISTINCT conversation."participantEmail" AS "participantEmail"
    FROM "Conversation" AS conversation
    WHERE conversation."avatarAgentId" = ${avatarAgentId}
      AND conversation."avatarGroupId" IS NULL
      AND LOWER(BTRIM(conversation."participantEmail")) = ${participantEmail}
      AND (
        (
          conversation."visibility" = 'public'::"ConversationVisibility"
          AND conversation."shareLinkId" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM "ShareLink" AS share_link
            WHERE share_link."id" = conversation."shareLinkId"
              AND share_link."ownerId" = ${ownerId}
              AND share_link."avatarAgentId" = ${avatarAgentId}
          )
        )
        OR EXISTS (
          SELECT 1
          FROM "AccessGrant" AS access_grant
          WHERE access_grant."id" = conversation."accessGrantId"
            AND access_grant."ownerId" = ${ownerId}
            AND access_grant."avatarAgentId" = ${avatarAgentId}
        )
      )
  `);
  return rows.map((row) => row.participantEmail);
}

function normalizeParticipantEmail(value: string) {
  return value.trim().toLowerCase();
}

function preferGrant<T extends { status: "active" | "revoked"; createdAt: Date }>(candidate: T, current: T) {
  if (candidate.status !== current.status) return candidate.status === "active";
  return candidate.createdAt > current.createdAt;
}
