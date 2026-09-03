import { Prisma, type PrismaClient } from "@prisma/client";
import { OwnershipError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

const safeMessageRoles = ["user", "assistant"] as const;

export type GroupRosterSnapshotMember = {
  id: string;
  name: string;
  position: number;
};

export function createAvatarGroupActivityRepository(db: Db) {
  async function ensureOwnedGroup(ownerId: string, avatarGroupId: string) {
    const group = await db.avatarGroup.findFirst({
      where: { id: avatarGroupId, ownerId },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!group) throw new OwnershipError();
    return group;
  }

  return {
    async listParticipants(ownerId: string, avatarGroupId: string) {
      const group = await ensureOwnedGroup(ownerId, avatarGroupId);
      const [grants, activity] = await Promise.all([
        db.groupAccessGrant.findMany({
          where: { ownerId, avatarGroupId },
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
          where: groupConversationWhere(ownerId, avatarGroupId),
          _count: { id: true },
          _max: { createdAt: true, lastMessageAt: true },
        }),
      ]);

      const emails = new Set<string>();
      const rawEmails = new Set<string>();
      const grantsByEmail = new Map<string, (typeof grants)[number]>();
      for (const grant of grants) {
        const email = normalizeParticipantEmail(grant.participantEmail);
        if (!email) continue;
        emails.add(email);
        rawEmails.add(grant.participantEmail);
        const current = grantsByEmail.get(email);
        if (!current || preferGrant(grant, current)) grantsByEmail.set(email, grant);
      }

      const activityByEmail = new Map<string, typeof activity>();
      for (const record of activity) {
        if (!record.participantEmail) continue;
        const email = normalizeParticipantEmail(record.participantEmail);
        if (!email) continue;
        emails.add(email);
        rawEmails.add(record.participantEmail);
        const records = activityByEmail.get(email);
        if (records) records.push(record);
        else activityByEmail.set(email, [record]);
      }

      const linkedPublicSessions = await db.groupPublicSession.findMany({
        where: {
          avatarGroupId,
          participantEmail: { in: [...rawEmails] },
          participantUserId: { not: null },
          avatarGroupOwnerIdSnapshot: ownerId,
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

      return {
        group: { id: group.id, name: group.name, deletedAt: group.deletedAt },
        participants: [...emails].map((participantEmail) => {
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
            lastActivityAt: dates.length
              ? new Date(Math.max(...dates.map((value) => value.getTime())))
              : null,
          };
        }),
      };
    },

    async listConversations(
      ownerId: string,
      avatarGroupId: string,
      participantEmail: string,
      options: { limit: number; cursor?: string }
    ) {
      const group = await ensureOwnedGroup(ownerId, avatarGroupId);
      const normalizedEmail = normalizeParticipantEmail(participantEmail);
      if (!normalizedEmail) throw new OwnershipError();
      const participantExists = await hasParticipant(db, ownerId, avatarGroupId, normalizedEmail);
      if (!participantExists) throw new OwnershipError();

      const emailVariants = await listConversationEmailVariants(db, ownerId, avatarGroupId, normalizedEmail);
      const where = participantConversationWhere(ownerId, avatarGroupId, emailVariants);
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
          avatarGroupNameSnapshot: true,
          avatarGroupRosterSnapshot: true,
          groupParticipantSnapshots: {
            orderBy: { position: "asc" },
            select: { sourceAvatarId: true, name: true, position: true },
          },
          groupVoiceSession: { select: { activatedAt: true, endedAt: true } },
          groupShareLink: { select: { name: true } },
          _count: { select: { messages: { where: { role: { in: [...safeMessageRoles] } } } } },
        },
      });
      return { invalidCursor: false as const, group, conversations };
    },

    async findConversation(ownerId: string, avatarGroupId: string, conversationId: string) {
      const group = await ensureOwnedGroup(ownerId, avatarGroupId);
      const conversation = await db.conversation.findFirst({
        where: {
          id: conversationId,
          ...groupConversationWhere(ownerId, avatarGroupId),
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
          avatarGroupNameSnapshot: true,
          avatarGroupRosterSnapshot: true,
          groupParticipantSnapshots: {
            orderBy: { position: "asc" },
            select: { sourceAvatarId: true, name: true, position: true },
          },
          groupVoiceSession: { select: { activatedAt: true, endedAt: true } },
          groupShareLink: { select: { name: true } },
          messages: {
            where: { role: { in: [...safeMessageRoles] } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              role: true,
              content: true,
              speakerAvatarId: true,
              groupParticipantSnapshot: {
                select: { sourceAvatarId: true, name: true },
              },
              createdAt: true,
            },
          },
        },
      });
      if (!conversation?.participantEmail) return null;
      return { group, ...conversation };
    },
  };
}

function groupConversationWhere(ownerId: string, avatarGroupId: string) {
  return {
    avatarGroupId,
    avatarGroupOwnerIdSnapshot: ownerId,
    participantEmail: { not: null },
    groupVoiceSession: { is: { activatedAt: { not: null } } },
    OR: [
      {
        visibility: "public" as const,
        groupShareLinkId: { not: null },
        groupShareLink: { is: { ownerId, avatarGroupId } },
      },
      {
        visibility: "private" as const,
        groupAccessGrantId: { not: null },
        groupAccessGrant: { is: { ownerId, avatarGroupId } },
      },
    ],
  };
}

function participantConversationWhere(ownerId: string, avatarGroupId: string, participantEmails: string[]) {
  return {
    ...groupConversationWhere(ownerId, avatarGroupId),
    participantEmail: { in: participantEmails },
  };
}

async function hasParticipant(db: Db, ownerId: string, avatarGroupId: string, participantEmail: string) {
  const [grants, conversations] = await Promise.all([
    db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT group_grant."id"
      FROM "GroupAccessGrant" AS group_grant
      WHERE group_grant."ownerId" = ${ownerId}
        AND group_grant."avatarGroupId" = ${avatarGroupId}
        AND LOWER(BTRIM(group_grant."participantEmail")) = ${participantEmail}
      LIMIT 1
    `),
    db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT conversation."id"
      FROM "Conversation" AS conversation
      WHERE conversation."avatarGroupId" = ${avatarGroupId}
        AND conversation."avatarGroupOwnerIdSnapshot" = ${ownerId}
        AND LOWER(BTRIM(conversation."participantEmail")) = ${participantEmail}
        AND EXISTS (
          SELECT 1
          FROM "GroupVoiceSession" AS group_session
          WHERE group_session."conversationId" = conversation."id"
            AND group_session."activatedAt" IS NOT NULL
        )
        AND (
          (
            conversation."visibility" = 'public'::"ConversationVisibility"
            AND conversation."groupShareLinkId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "GroupShareLink" AS scoped_group_link
              WHERE scoped_group_link."id" = conversation."groupShareLinkId"
                AND scoped_group_link."ownerId" = ${ownerId}
                AND scoped_group_link."avatarGroupId" = ${avatarGroupId}
            )
          )
          OR (
            conversation."visibility" = 'private'::"ConversationVisibility"
            AND conversation."groupAccessGrantId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "GroupAccessGrant" AS scoped_group_grant
              WHERE scoped_group_grant."id" = conversation."groupAccessGrantId"
                AND scoped_group_grant."ownerId" = ${ownerId}
                AND scoped_group_grant."avatarGroupId" = ${avatarGroupId}
            )
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
  avatarGroupId: string,
  participantEmail: string
) {
  const rows = await db.$queryRaw<Array<{ participantEmail: string }>>(Prisma.sql`
    SELECT DISTINCT conversation."participantEmail" AS "participantEmail"
    FROM "Conversation" AS conversation
    WHERE conversation."avatarGroupId" = ${avatarGroupId}
      AND conversation."avatarGroupOwnerIdSnapshot" = ${ownerId}
      AND LOWER(BTRIM(conversation."participantEmail")) = ${participantEmail}
      AND EXISTS (
        SELECT 1
        FROM "GroupVoiceSession" AS group_session
        WHERE group_session."conversationId" = conversation."id"
          AND group_session."activatedAt" IS NOT NULL
      )
      AND (
        (
          conversation."visibility" = 'public'::"ConversationVisibility"
          AND conversation."groupShareLinkId" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM "GroupShareLink" AS scoped_group_link
            WHERE scoped_group_link."id" = conversation."groupShareLinkId"
              AND scoped_group_link."ownerId" = ${ownerId}
              AND scoped_group_link."avatarGroupId" = ${avatarGroupId}
          )
        )
        OR (
          conversation."visibility" = 'private'::"ConversationVisibility"
          AND conversation."groupAccessGrantId" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM "GroupAccessGrant" AS scoped_group_grant
            WHERE scoped_group_grant."id" = conversation."groupAccessGrantId"
              AND scoped_group_grant."ownerId" = ${ownerId}
              AND scoped_group_grant."avatarGroupId" = ${avatarGroupId}
          )
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
