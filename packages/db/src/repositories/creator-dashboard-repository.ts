import { Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type CreatorDashboardQuery = {
  activityFrom: Date;
  activityTo: Date;
  cohortFrom: Date;
  cohortTo: Date;
  timeZone: string;
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
        };
      }

      const participantScope = Prisma.sql`
        conversation."participantEmail" IS NOT NULL
        AND BTRIM(conversation."participantEmail") <> ''
        AND LOWER(BTRIM(conversation."participantEmail")) <> LOWER(BTRIM(${owner.email}))
        AND (
          conversation."visibility" = 'public'::"ConversationVisibility"
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
      };
    },
  };
}
