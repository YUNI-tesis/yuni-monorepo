import { Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type CreatorDashboardQuery = {
  activityFrom: Date;
  activityTo: Date;
  cohortFrom: Date;
  cohortTo: Date;
  timeZone: string;
  includeGroupAnalytics?: boolean;
};

type ActivityBucketRow = {
  conversationId: string;
  avatarAgentId: string;
  participantEmail: string;
  participantName: string | null;
  origin: "access_grant" | "public_link";
  mode: "text" | "voice";
  status: "active" | "ended";
  title: string | null;
  activityDate: string;
  lastActivityAt: Date;
  participantTurns: number;
};

type GrantActivityRow = {
  id: string;
  avatarAgentId: string;
  participantEmail: string;
  participantName: string | null;
  status: "active" | "revoked";
  createdAt: Date;
  firstDirectActivityAt: Date | null;
  latestParticipantActivityAt: Date | null;
};

type InterruptedConversationRow = {
  sessionId: string;
  conversationId: string;
  avatarAgentId: string;
  participantEmail: string;
  participantName: string | null;
  startedAt: Date;
  totalCount: number;
};

type VoiceSessionRow = {
  id: string;
  conversationId: string;
  avatarAgentId: string;
  status: "connecting" | "active" | "ended" | "errored";
  startedAt: Date;
  activatedAt: Date | null;
  endedAt: Date | null;
};

type AvatarLastActivityRow = {
  avatarAgentId: string;
  lastActivityAt: Date;
};

type GroupActivityBucketRow = {
  conversationId: string;
  avatarGroupId: string;
  avatarGroupName: string;
  participantEmail: string;
  participantName: string | null;
  origin: "access_grant" | "public_link";
  mode: "text" | "voice";
  status: "active" | "ended";
  title: string | null;
  activityDate: string;
  lastActivityAt: Date;
  participantTurns: number;
};

type GroupGrantActivityRow = {
  id: string;
  avatarGroupId: string;
  avatarGroupName: string;
  participantEmail: string;
  participantName: string | null;
  status: "active" | "revoked";
  createdAt: Date;
  firstDirectActivityAt: Date | null;
  latestParticipantActivityAt: Date | null;
};

type InterruptedGroupConversationRow = {
  sessionId: string;
  conversationId: string;
  avatarGroupId: string;
  avatarGroupName: string;
  participantEmail: string;
  participantName: string | null;
  startedAt: Date;
  totalCount: number;
};

type GroupVoiceSessionRow = {
  id: string;
  conversationId: string;
  avatarGroupId: string;
  status: "connecting" | "active" | "ended" | "errored";
  startedAt: Date;
  activatedAt: Date | null;
  endedAt: Date | null;
};

type GroupLastActivityRow = {
  avatarGroupId: string;
  lastActivityAt: Date;
};

const emptyGroupDashboardData = {
  groups: [],
  groupActivityBuckets: [] as GroupActivityBucketRow[],
  groupGrants: [] as GroupGrantActivityRow[],
  groupVoiceSessions: [] as GroupVoiceSessionRow[],
  interruptedGroupConversations: [] as InterruptedGroupConversationRow[],
  groupLastActivity: [] as GroupLastActivityRow[],
};

export function createCreatorDashboardRepository(db: Db) {
  return {
    async getSummaryData(ownerId: string, query: CreatorDashboardQuery) {
      const owner = await db.user.findUnique({
        where: { id: ownerId },
        select: {
          id: true,
          email: true,
          avatarAgents: {
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: {
              id: true,
              name: true,
              status: true,
              providerAgentId: true,
              providerSyncStatus: true,
              providerLastUsableAt: true,
            },
          },
        },
      });

      if (!owner) {
        return {
          avatars: [],
          activityBuckets: [],
          grants: [],
          voiceSessions: [],
          interruptedConversations: [],
          avatarLastActivity: [],
          ...emptyGroupDashboardData,
        };
      }

      const participantScope = Prisma.sql`
        conversation."participantEmail" IS NOT NULL
        AND BTRIM(conversation."participantEmail") <> ''
        AND LOWER(BTRIM(conversation."participantEmail")) <> LOWER(BTRIM(${owner.email}))
        AND conversation."avatarGroupId" IS NULL
        AND (
          (
            conversation."visibility" = 'public'::"ConversationVisibility"
            AND conversation."shareLinkId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "ShareLink" AS scoped_link
              WHERE scoped_link."id" = conversation."shareLinkId"
                AND scoped_link."ownerId" = ${ownerId}
                AND scoped_link."avatarAgentId" = conversation."avatarAgentId"
            )
          )
          OR (
            conversation."visibility" = 'private'::"ConversationVisibility"
            AND conversation."accessGrantId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "AccessGrant" AS scoped_grant
              WHERE scoped_grant."id" = conversation."accessGrantId"
                AND scoped_grant."ownerId" = ${ownerId}
                AND scoped_grant."avatarAgentId" = conversation."avatarAgentId"
            )
          )
        )
      `;

      const groupDataPromise = query.includeGroupAnalytics
        ? getGroupSummaryData(db, ownerId, owner.email, query)
        : Promise.resolve(emptyGroupDashboardData);

      const [activityBuckets, grants, voiceSessions, interruptedConversations, avatarLastActivity] =
        await Promise.all([
          db.$queryRaw<ActivityBucketRow[]>(Prisma.sql`
            WITH activity_events AS (
              SELECT
                conversation."id" AS "conversationId",
                conversation."avatarAgentId",
                LOWER(BTRIM(conversation."participantEmail")) AS "participantEmail",
                COALESCE(access_user."name", public_user."name") AS "participantName",
                CASE WHEN conversation."visibility" = 'public'::"ConversationVisibility"
                  THEN 'public_link' ELSE 'access_grant' END AS "origin",
                conversation."mode",
                conversation."status",
                conversation."title",
                message."createdAt" AS "occurredAt",
                1 AS "participantTurns"
              FROM "Message" AS message
              INNER JOIN "Conversation" AS conversation ON conversation."id" = message."conversationId"
              INNER JOIN "AvatarAgent" AS avatar ON avatar."id" = conversation."avatarAgentId"
              LEFT JOIN "AccessGrant" AS access_grant ON access_grant."id" = conversation."accessGrantId"
              LEFT JOIN "User" AS access_user ON access_user."id" = access_grant."participantUserId"
              LEFT JOIN "PublicSession" AS public_session ON public_session."id" = conversation."publicSessionId"
              LEFT JOIN "User" AS public_user ON public_user."id" = public_session."participantUserId"
              WHERE avatar."ownerId" = ${ownerId}
                AND ${participantScope}
                AND message."role" = 'user'::"MessageRole"
                AND message."createdAt" >= ${query.activityFrom}
                AND message."createdAt" < ${query.activityTo}

              UNION ALL

              SELECT
                conversation."id" AS "conversationId",
                conversation."avatarAgentId",
                LOWER(BTRIM(conversation."participantEmail")) AS "participantEmail",
                COALESCE(access_user."name", public_user."name") AS "participantName",
                CASE WHEN conversation."visibility" = 'public'::"ConversationVisibility"
                  THEN 'public_link' ELSE 'access_grant' END AS "origin",
                conversation."mode",
                conversation."status",
                conversation."title",
                realtime."activatedAt" AS "occurredAt",
                0 AS "participantTurns"
              FROM "RealtimeSession" AS realtime
              INNER JOIN "Conversation" AS conversation ON conversation."id" = realtime."conversationId"
              INNER JOIN "AvatarAgent" AS avatar ON avatar."id" = conversation."avatarAgentId"
              LEFT JOIN "AccessGrant" AS access_grant ON access_grant."id" = conversation."accessGrantId"
              LEFT JOIN "User" AS access_user ON access_user."id" = access_grant."participantUserId"
              LEFT JOIN "PublicSession" AS public_session ON public_session."id" = conversation."publicSessionId"
              LEFT JOIN "User" AS public_user ON public_user."id" = public_session."participantUserId"
              WHERE avatar."ownerId" = ${ownerId}
                AND realtime."avatarAgentId" = conversation."avatarAgentId"
                AND ${participantScope}
                AND realtime."activatedAt" >= ${query.activityFrom}
                AND realtime."activatedAt" < ${query.activityTo}
            ), dated_events AS (
              SELECT
                activity_events.*,
                TO_CHAR(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${query.timeZone}, 'YYYY-MM-DD')
                  AS "activityDate"
              FROM activity_events
            )
            SELECT
              "conversationId",
              "avatarAgentId",
              "participantEmail",
              MAX("participantName") AS "participantName",
              "origin",
              "mode",
              "status",
              MAX("title") AS "title",
              "activityDate",
              MAX("occurredAt") AS "lastActivityAt",
              SUM("participantTurns")::INTEGER AS "participantTurns"
            FROM dated_events
            GROUP BY
              "conversationId", "avatarAgentId", "participantEmail", "origin", "mode", "status",
              "activityDate"
            ORDER BY "activityDate" ASC, "conversationId" ASC
          `),
          db.$queryRaw<GrantActivityRow[]>(Prisma.sql`
            WITH relevant_grants AS (
              SELECT
                access_grant."id",
                access_grant."avatarAgentId",
                LOWER(BTRIM(access_grant."participantEmail")) AS "participantEmail",
                participant."name" AS "participantName",
                access_grant."status",
                access_grant."createdAt"
              FROM "AccessGrant" AS access_grant
              INNER JOIN "AvatarAgent" AS avatar
                ON avatar."id" = access_grant."avatarAgentId" AND avatar."ownerId" = ${ownerId}
              LEFT JOIN "User" AS participant ON participant."id" = access_grant."participantUserId"
              WHERE access_grant."ownerId" = ${ownerId}
                AND (
                  access_grant."status" = 'active'::"AccessGrantStatus"
                  OR (
                    access_grant."createdAt" >= ${query.cohortFrom}
                    AND access_grant."createdAt" < ${query.cohortTo}
                  )
                )
            ), grant_activity AS (
              SELECT
                relevant_grant."id" AS "grantId",
                conversation."accessGrantId",
                conversation."visibility",
                message."createdAt" AS "occurredAt"
              FROM relevant_grants AS relevant_grant
              INNER JOIN "Conversation" AS conversation
                ON conversation."avatarAgentId" = relevant_grant."avatarAgentId"
                AND LOWER(BTRIM(conversation."participantEmail")) = relevant_grant."participantEmail"
              INNER JOIN "Message" AS message ON message."conversationId" = conversation."id"
              WHERE ${participantScope}
                AND message."role" = 'user'::"MessageRole"
                AND message."createdAt" >= relevant_grant."createdAt"

              UNION ALL

              SELECT
                relevant_grant."id" AS "grantId",
                conversation."accessGrantId",
                conversation."visibility",
                realtime."activatedAt" AS "occurredAt"
              FROM relevant_grants AS relevant_grant
              INNER JOIN "Conversation" AS conversation
                ON conversation."avatarAgentId" = relevant_grant."avatarAgentId"
                AND LOWER(BTRIM(conversation."participantEmail")) = relevant_grant."participantEmail"
              INNER JOIN "RealtimeSession" AS realtime
                ON realtime."conversationId" = conversation."id"
                AND realtime."avatarAgentId" = relevant_grant."avatarAgentId"
              WHERE ${participantScope}
                AND realtime."activatedAt" >= relevant_grant."createdAt"
            )
            SELECT
              relevant_grant."id",
              relevant_grant."avatarAgentId",
              relevant_grant."participantEmail",
              relevant_grant."participantName",
              relevant_grant."status",
              relevant_grant."createdAt",
              MIN(activity."occurredAt") FILTER (
                WHERE activity."accessGrantId" = relevant_grant."id"
                  AND activity."visibility" = 'private'::"ConversationVisibility"
              ) AS "firstDirectActivityAt",
              MAX(activity."occurredAt") AS "latestParticipantActivityAt"
            FROM relevant_grants AS relevant_grant
            LEFT JOIN grant_activity AS activity ON activity."grantId" = relevant_grant."id"
            GROUP BY
              relevant_grant."id", relevant_grant."avatarAgentId", relevant_grant."participantEmail",
              relevant_grant."participantName", relevant_grant."status", relevant_grant."createdAt"
          `),
          db.$queryRaw<VoiceSessionRow[]>(Prisma.sql`
            SELECT
              realtime."id",
              realtime."conversationId",
              realtime."avatarAgentId",
              realtime."status",
              realtime."startedAt",
              realtime."activatedAt",
              realtime."endedAt"
            FROM "RealtimeSession" AS realtime
            INNER JOIN "Conversation" AS conversation ON conversation."id" = realtime."conversationId"
            INNER JOIN "AvatarAgent" AS avatar ON avatar."id" = conversation."avatarAgentId"
            WHERE avatar."ownerId" = ${ownerId}
              AND realtime."avatarAgentId" = conversation."avatarAgentId"
              AND ${participantScope}
              AND realtime."endedAt" >= ${query.activityFrom}
              AND realtime."endedAt" < ${query.activityTo}
          `),
          db.$queryRaw<InterruptedConversationRow[]>(Prisma.sql`
            WITH decisive_voice_attempts AS (
              SELECT
                realtime."id" AS "sessionId",
                conversation."id" AS "conversationId",
                conversation."avatarAgentId",
                LOWER(BTRIM(conversation."participantEmail")) AS "participantEmail",
                COALESCE(access_user."name", public_user."name") AS "participantName",
                realtime."startedAt",
                realtime."status",
                realtime."activatedAt"
              FROM "RealtimeSession" AS realtime
              INNER JOIN "Conversation" AS conversation ON conversation."id" = realtime."conversationId"
              INNER JOIN "AvatarAgent" AS avatar ON avatar."id" = conversation."avatarAgentId"
              LEFT JOIN "AccessGrant" AS access_grant ON access_grant."id" = conversation."accessGrantId"
              LEFT JOIN "User" AS access_user ON access_user."id" = access_grant."participantUserId"
              LEFT JOIN "PublicSession" AS public_session ON public_session."id" = conversation."publicSessionId"
              LEFT JOIN "User" AS public_user ON public_user."id" = public_session."participantUserId"
              WHERE avatar."ownerId" = ${ownerId}
                AND realtime."avatarAgentId" = conversation."avatarAgentId"
                AND ${participantScope}
                AND (
                  realtime."status" = 'errored'::"RealtimeSessionStatus"
                  OR (
                    realtime."status" IN (
                      'active'::"RealtimeSessionStatus",
                      'ended'::"RealtimeSessionStatus"
                    )
                    AND realtime."activatedAt" IS NOT NULL
                  )
                )
            ), latest_voice_attempt AS (
              SELECT
                decisive_voice_attempts.*,
                ROW_NUMBER() OVER (
                  PARTITION BY "conversationId"
                  ORDER BY "startedAt" DESC, "sessionId" DESC
                ) AS "attemptRank"
              FROM decisive_voice_attempts
            )
            SELECT
              "sessionId",
              "conversationId",
              "avatarAgentId",
              "participantEmail",
              "participantName",
              "startedAt",
              (COUNT(*) OVER ())::INTEGER AS "totalCount"
            FROM latest_voice_attempt
            WHERE "attemptRank" = 1
              AND "status" = 'errored'::"RealtimeSessionStatus"
            ORDER BY "startedAt" DESC, "sessionId" DESC
            LIMIT 5
          `),
          db.$queryRaw<AvatarLastActivityRow[]>(Prisma.sql`
            SELECT avatar."id" AS "avatarAgentId", latest_activity."lastActivityAt"
            FROM "AvatarAgent" AS avatar
            CROSS JOIN LATERAL (
              SELECT MAX(activity."occurredAt") AS "lastActivityAt"
              FROM (
                SELECT MAX(message."createdAt") AS "occurredAt"
                FROM "Conversation" AS conversation
                INNER JOIN "Message" AS message ON message."conversationId" = conversation."id"
                WHERE conversation."avatarAgentId" = avatar."id"
                  AND ${participantScope}
                  AND message."role" = 'user'::"MessageRole"

                UNION ALL

                SELECT MAX(realtime."activatedAt") AS "occurredAt"
                FROM "Conversation" AS conversation
                INNER JOIN "RealtimeSession" AS realtime
                  ON realtime."conversationId" = conversation."id"
                  AND realtime."avatarAgentId" = avatar."id"
                WHERE conversation."avatarAgentId" = avatar."id"
                  AND ${participantScope}
                  AND realtime."activatedAt" IS NOT NULL
              ) AS activity
            ) AS latest_activity
            WHERE avatar."ownerId" = ${ownerId} AND latest_activity."lastActivityAt" IS NOT NULL
          `),
        ]);

      return {
        avatars: owner.avatarAgents,
        activityBuckets,
        grants,
        voiceSessions,
        interruptedConversations,
        avatarLastActivity,
        ...(await groupDataPromise),
      };
    },
  };
}

async function getGroupSummaryData(
  db: Db,
  ownerId: string,
  ownerEmail: string,
  query: CreatorDashboardQuery
) {
  const participantScope = Prisma.sql`
    conversation."participantEmail" IS NOT NULL
    AND BTRIM(conversation."participantEmail") <> ''
    AND LOWER(BTRIM(conversation."participantEmail")) <> LOWER(BTRIM(${ownerEmail}))
    AND conversation."avatarGroupOwnerIdSnapshot" = ${ownerId}
    AND conversation."avatarGroupId" IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "GroupVoiceSession" AS activated_group_session
      WHERE activated_group_session."conversationId" = conversation."id"
        AND activated_group_session."activatedAt" IS NOT NULL
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
            AND scoped_group_link."avatarGroupId" = conversation."avatarGroupId"
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
            AND scoped_group_grant."avatarGroupId" = conversation."avatarGroupId"
        )
      )
    )
  `;

  const [
    groups,
    groupActivityBuckets,
    groupGrants,
    groupVoiceSessions,
    interruptedGroupConversations,
    groupLastActivity,
  ] = await Promise.all([
    db.avatarGroup.findMany({
      where: { ownerId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        ownerId: true,
        name: true,
        deletedAt: true,
        members: {
          orderBy: { position: "asc" },
          select: {
            accessGrantId: true,
            avatarAgent: {
              select: {
                id: true,
                ownerId: true,
                status: true,
                liveAvatarConfig: true,
                voiceConfig: true,
                groupProviderAgentId: true,
                groupProviderSyncStatus: true,
              },
            },
          },
        },
      },
    }),
    db.$queryRaw<GroupActivityBucketRow[]>(Prisma.sql`
      WITH activity_events AS (
        SELECT
          conversation."id" AS "conversationId",
          conversation."avatarGroupId",
          COALESCE(conversation."avatarGroupNameSnapshot", avatar_group."name", 'Grupo eliminado')
            AS "avatarGroupName",
          LOWER(BTRIM(conversation."participantEmail")) AS "participantEmail",
          COALESCE(group_access_user."name", group_public_user."name") AS "participantName",
          CASE WHEN conversation."visibility" = 'public'::"ConversationVisibility"
            THEN 'public_link' ELSE 'access_grant' END AS "origin",
          conversation."mode",
          conversation."status",
          conversation."title",
          message."createdAt" AS "occurredAt",
          1 AS "participantTurns"
        FROM "Message" AS message
        INNER JOIN "Conversation" AS conversation ON conversation."id" = message."conversationId"
        LEFT JOIN "AvatarGroup" AS avatar_group ON avatar_group."id" = conversation."avatarGroupId"
        LEFT JOIN "GroupAccessGrant" AS group_grant
          ON group_grant."id" = conversation."groupAccessGrantId"
        LEFT JOIN "User" AS group_access_user ON group_access_user."id" = group_grant."participantUserId"
        LEFT JOIN "GroupPublicSession" AS group_public_session
          ON group_public_session."id" = conversation."groupPublicSessionId"
        LEFT JOIN "User" AS group_public_user
          ON group_public_user."id" = group_public_session."participantUserId"
        WHERE ${participantScope}
          AND message."role" = 'user'::"MessageRole"
          AND message."createdAt" >= ${query.activityFrom}
          AND message."createdAt" < ${query.activityTo}

        UNION ALL

        SELECT
          conversation."id" AS "conversationId",
          conversation."avatarGroupId",
          COALESCE(conversation."avatarGroupNameSnapshot", avatar_group."name", 'Grupo eliminado')
            AS "avatarGroupName",
          LOWER(BTRIM(conversation."participantEmail")) AS "participantEmail",
          COALESCE(group_access_user."name", group_public_user."name") AS "participantName",
          CASE WHEN conversation."visibility" = 'public'::"ConversationVisibility"
            THEN 'public_link' ELSE 'access_grant' END AS "origin",
          conversation."mode",
          conversation."status",
          conversation."title",
          group_voice."activatedAt" AS "occurredAt",
          0 AS "participantTurns"
        FROM "GroupVoiceSession" AS group_voice
        INNER JOIN "Conversation" AS conversation ON conversation."id" = group_voice."conversationId"
        LEFT JOIN "AvatarGroup" AS avatar_group ON avatar_group."id" = conversation."avatarGroupId"
        LEFT JOIN "GroupAccessGrant" AS group_grant
          ON group_grant."id" = conversation."groupAccessGrantId"
        LEFT JOIN "User" AS group_access_user ON group_access_user."id" = group_grant."participantUserId"
        LEFT JOIN "GroupPublicSession" AS group_public_session
          ON group_public_session."id" = conversation."groupPublicSessionId"
        LEFT JOIN "User" AS group_public_user
          ON group_public_user."id" = group_public_session."participantUserId"
        WHERE ${participantScope}
          AND group_voice."activatedAt" >= ${query.activityFrom}
          AND group_voice."activatedAt" < ${query.activityTo}
      ), conversation_events AS (
        SELECT
          "conversationId",
          "avatarGroupId",
          MAX("avatarGroupName") AS "avatarGroupName",
          "participantEmail",
          MAX("participantName") AS "participantName",
          "origin",
          "mode",
          "status",
          MAX("title") AS "title",
          MAX("occurredAt") AS "lastActivityAt",
          SUM("participantTurns")::INTEGER AS "participantTurns"
        FROM activity_events
        GROUP BY
          "conversationId", "avatarGroupId", "participantEmail", "origin", "mode", "status"
      )
      SELECT
        "conversationId",
        "avatarGroupId",
        "avatarGroupName",
        "participantEmail",
        "participantName",
        "origin",
        "mode",
        "status",
        "title",
        TO_CHAR(("lastActivityAt" AT TIME ZONE 'UTC') AT TIME ZONE ${query.timeZone}, 'YYYY-MM-DD')
          AS "activityDate",
        "lastActivityAt",
        "participantTurns"
      FROM conversation_events
      ORDER BY "activityDate" ASC, "conversationId" ASC
    `),
    db.$queryRaw<GroupGrantActivityRow[]>(Prisma.sql`
      WITH relevant_grants AS (
        SELECT
          group_grant."id",
          group_grant."avatarGroupId",
          COALESCE(group_grant."avatarGroupNameSnapshot", avatar_group."name", 'Grupo eliminado')
            AS "avatarGroupName",
          LOWER(BTRIM(group_grant."participantEmail")) AS "participantEmail",
          participant."name" AS "participantName",
          group_grant."status",
          group_grant."createdAt"
        FROM "GroupAccessGrant" AS group_grant
        LEFT JOIN "AvatarGroup" AS avatar_group ON avatar_group."id" = group_grant."avatarGroupId"
        LEFT JOIN "User" AS participant ON participant."id" = group_grant."participantUserId"
        WHERE group_grant."ownerId" = ${ownerId}
          AND group_grant."avatarGroupId" IS NOT NULL
          AND (
            group_grant."status" = 'active'::"AccessGrantStatus"
            OR (
              group_grant."createdAt" >= ${query.cohortFrom}
              AND group_grant."createdAt" < ${query.cohortTo}
            )
          )
      ), grant_activity AS (
        SELECT
          relevant_grant."id" AS "grantId",
          conversation."groupAccessGrantId",
          conversation."visibility",
          message."createdAt" AS "occurredAt"
        FROM relevant_grants AS relevant_grant
        INNER JOIN "Conversation" AS conversation
          ON conversation."avatarGroupId" = relevant_grant."avatarGroupId"
          AND LOWER(BTRIM(conversation."participantEmail")) = relevant_grant."participantEmail"
        INNER JOIN "Message" AS message ON message."conversationId" = conversation."id"
        WHERE ${participantScope}
          AND message."role" = 'user'::"MessageRole"
          AND message."createdAt" >= relevant_grant."createdAt"

        UNION ALL

        SELECT
          relevant_grant."id" AS "grantId",
          conversation."groupAccessGrantId",
          conversation."visibility",
          group_voice."activatedAt" AS "occurredAt"
        FROM relevant_grants AS relevant_grant
        INNER JOIN "Conversation" AS conversation
          ON conversation."avatarGroupId" = relevant_grant."avatarGroupId"
          AND LOWER(BTRIM(conversation."participantEmail")) = relevant_grant."participantEmail"
        INNER JOIN "GroupVoiceSession" AS group_voice
          ON group_voice."conversationId" = conversation."id"
        WHERE ${participantScope}
          AND group_voice."activatedAt" >= relevant_grant."createdAt"
      )
      SELECT
        relevant_grant."id",
        relevant_grant."avatarGroupId",
        relevant_grant."avatarGroupName",
        relevant_grant."participantEmail",
        relevant_grant."participantName",
        relevant_grant."status",
        relevant_grant."createdAt",
        MIN(activity."occurredAt") FILTER (
          WHERE activity."groupAccessGrantId" = relevant_grant."id"
            AND activity."visibility" = 'private'::"ConversationVisibility"
        ) AS "firstDirectActivityAt",
        MAX(activity."occurredAt") AS "latestParticipantActivityAt"
      FROM relevant_grants AS relevant_grant
      LEFT JOIN grant_activity AS activity ON activity."grantId" = relevant_grant."id"
      GROUP BY
        relevant_grant."id", relevant_grant."avatarGroupId", relevant_grant."avatarGroupName",
        relevant_grant."participantEmail", relevant_grant."participantName", relevant_grant."status",
        relevant_grant."createdAt"
    `),
    db.$queryRaw<GroupVoiceSessionRow[]>(Prisma.sql`
      SELECT
        group_voice."id",
        group_voice."conversationId",
        conversation."avatarGroupId",
        group_voice."status",
        group_voice."startedAt",
        group_voice."activatedAt",
        group_voice."endedAt"
      FROM "GroupVoiceSession" AS group_voice
      INNER JOIN "Conversation" AS conversation ON conversation."id" = group_voice."conversationId"
      WHERE ${participantScope}
        AND group_voice."activatedAt" IS NOT NULL
        AND group_voice."endedAt" >= ${query.activityFrom}
        AND group_voice."endedAt" < ${query.activityTo}
    `),
    db.$queryRaw<InterruptedGroupConversationRow[]>(Prisma.sql`
      SELECT
        group_voice."id" AS "sessionId",
        conversation."id" AS "conversationId",
        conversation."avatarGroupId",
        COALESCE(conversation."avatarGroupNameSnapshot", avatar_group."name", 'Grupo eliminado')
          AS "avatarGroupName",
        LOWER(BTRIM(conversation."participantEmail")) AS "participantEmail",
        COALESCE(group_access_user."name", group_public_user."name") AS "participantName",
        group_voice."startedAt",
        (COUNT(*) OVER ())::INTEGER AS "totalCount"
      FROM "GroupVoiceSession" AS group_voice
      INNER JOIN "Conversation" AS conversation ON conversation."id" = group_voice."conversationId"
      LEFT JOIN "AvatarGroup" AS avatar_group ON avatar_group."id" = conversation."avatarGroupId"
      LEFT JOIN "GroupAccessGrant" AS group_grant
        ON group_grant."id" = conversation."groupAccessGrantId"
      LEFT JOIN "User" AS group_access_user ON group_access_user."id" = group_grant."participantUserId"
      LEFT JOIN "GroupPublicSession" AS group_public_session
        ON group_public_session."id" = conversation."groupPublicSessionId"
      LEFT JOIN "User" AS group_public_user
        ON group_public_user."id" = group_public_session."participantUserId"
      WHERE ${participantScope}
        AND group_voice."status" = 'errored'::"GroupVoiceSessionStatus"
        AND group_voice."activatedAt" IS NOT NULL
      ORDER BY group_voice."startedAt" DESC, group_voice."id" DESC
      LIMIT 5
    `),
    db.$queryRaw<GroupLastActivityRow[]>(Prisma.sql`
      SELECT activity."avatarGroupId", MAX(activity."occurredAt") AS "lastActivityAt"
      FROM (
        SELECT conversation."avatarGroupId", message."createdAt" AS "occurredAt"
        FROM "Conversation" AS conversation
        INNER JOIN "Message" AS message ON message."conversationId" = conversation."id"
        WHERE ${participantScope}
          AND message."role" = 'user'::"MessageRole"

        UNION ALL

        SELECT conversation."avatarGroupId", group_voice."activatedAt" AS "occurredAt"
        FROM "Conversation" AS conversation
        INNER JOIN "GroupVoiceSession" AS group_voice
          ON group_voice."conversationId" = conversation."id"
        WHERE ${participantScope}
          AND group_voice."activatedAt" IS NOT NULL
      ) AS activity
      GROUP BY activity."avatarGroupId"
    `),
  ]);

  return {
    groups,
    groupActivityBuckets,
    groupGrants,
    groupVoiceSessions,
    interruptedGroupConversations,
    groupLastActivity,
  };
}
