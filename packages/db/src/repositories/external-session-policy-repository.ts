import type { InteractionLimits } from "@yuni/domain";
import type { PrismaClient } from "@prisma/client";

type Db = PrismaClient;
const countedStatuses = ["connecting", "active", "ended"] as const;
const activeStatuses = ["connecting", "active"] as const;

export function createExternalSessionPolicyRepository(db: Db) {
  return {
    reservePublicSession(
      input: {
        shareLinkId: string;
        participantEmail: string;
        participantUserId?: string;
        avatarAgentId: string;
        consentedAt: Date;
        since: Date;
      },
      decideExpiresAt: (snapshot: {
        limits: InteractionLimits;
        usage: Array<{ id: string; startedAt: Date; endedAt: Date | null }>;
        participantActive: number;
        avatarActive: number;
      }) => Date
    ) {
      return db.$transaction(async (transaction) => {
        const links = await transaction.$queryRaw<
          Array<{
            id: string;
            maxSessionDurationSeconds: number | null;
            maxSessionsPer24Hours: number | null;
          }>
        >`
          SELECT
            share_link."id",
            share_link."maxSessionDurationSeconds",
            share_link."maxSessionsPer24Hours"
          FROM "ShareLink" AS share_link
          INNER JOIN "AvatarAgent" AS avatar_agent
            ON avatar_agent."id" = share_link."avatarAgentId"
          WHERE share_link."id" = ${input.shareLinkId}
            AND share_link."avatarAgentId" = ${input.avatarAgentId}
            AND share_link."isEnabled" = TRUE
            AND avatar_agent."status" = 'active'::"AvatarStatus"
          FOR UPDATE OF share_link, avatar_agent
        `;
        const link = links[0];
        if (!link) return null;

        const [usage, participantActive, avatarActive] = await Promise.all([
          transaction.publicSession.findMany({
            where: {
              status: { in: ["active", "ended"] },
              startedAt: { gt: input.since },
              shareLinkId: link.id,
              participantEmail: input.participantEmail,
            },
            select: { id: true, startedAt: true, endedAt: true },
            orderBy: { startedAt: "asc" },
          }),
          transaction.realtimeSession.count({
            where: {
              status: { in: [...activeStatuses] },
              publicSession: {
                shareLinkId: link.id,
                participantEmail: input.participantEmail,
              },
            },
          }),
          transaction.realtimeSession.count({
            where: {
              avatarAgentId: input.avatarAgentId,
              status: { in: [...activeStatuses] },
              OR: [{ publicSessionId: { not: null } }, { accessGrantId: { not: null } }],
            },
          }),
        ]);
        const expiresAt = decideExpiresAt({
          limits: {
            maxSessionDurationSeconds: link.maxSessionDurationSeconds,
            maxSessionsPer24Hours: link.maxSessionsPer24Hours,
          },
          usage,
          participantActive,
          avatarActive,
        });
        const publicSession = await transaction.publicSession.create({
          data: {
            shareLinkId: link.id,
            avatarAgentId: input.avatarAgentId,
            participantEmail: input.participantEmail,
            ...(input.participantUserId ? { participantUserId: input.participantUserId } : {}),
            consentedAt: input.consentedAt,
            expiresAt,
          },
          select: { id: true },
        });
        const conversation = await transaction.conversation.create({
          data: {
            avatarAgentId: input.avatarAgentId,
            shareLinkId: link.id,
            publicSessionId: publicSession.id,
            participantEmail: input.participantEmail,
            visibility: "public",
            mode: "voice",
          },
          select: { id: true },
        });
        const realtimeSession = await transaction.realtimeSession.create({
          data: {
            avatarAgentId: input.avatarAgentId,
            publicSessionId: publicSession.id,
            conversationId: conversation.id,
          },
          select: { id: true },
        });

        return { publicSession, conversation, realtimeSession, expiresAt };
      });
    },

    reserveSharedSession(
      input: {
        accessGrantId: string;
        participantUserId: string;
        avatarAgentId: string;
        since: Date;
      },
      decideExpiresAt: (snapshot: {
        limits: InteractionLimits;
        usage: Array<{ id: string; startedAt: Date; endedAt: Date | null }>;
        participantActive: number;
        avatarActive: number;
      }) => Date
    ) {
      return db.$transaction(async (transaction) => {
        const grants = await transaction.$queryRaw<
          Array<{
            id: string;
            participantEmail: string;
            maxSessionDurationSeconds: number | null;
            maxSessionsPer24Hours: number | null;
          }>
        >`
          SELECT
            access_grant."id",
            access_grant."participantEmail",
            access_grant."maxSessionDurationSeconds",
            access_grant."maxSessionsPer24Hours"
          FROM "AccessGrant" AS access_grant
          INNER JOIN "AvatarAgent" AS avatar_agent
            ON avatar_agent."id" = access_grant."avatarAgentId"
          WHERE access_grant."id" = ${input.accessGrantId}
            AND access_grant."avatarAgentId" = ${input.avatarAgentId}
            AND access_grant."participantUserId" = ${input.participantUserId}
            AND access_grant."status" = 'active'::"AccessGrantStatus"
            AND avatar_agent."status" = 'active'::"AvatarStatus"
          FOR UPDATE OF access_grant, avatar_agent
        `;
        const grant = grants[0];
        if (!grant) return null;

        const [usage, participantActive, avatarActive] = await Promise.all([
          transaction.realtimeSession.findMany({
            where: {
              status: { in: [...countedStatuses] },
              startedAt: { gt: input.since },
              accessGrantId: input.accessGrantId,
            },
            select: { id: true, startedAt: true, endedAt: true },
            orderBy: { startedAt: "asc" },
          }),
          transaction.realtimeSession.count({
            where: {
              status: { in: [...activeStatuses] },
              accessGrantId: input.accessGrantId,
            },
          }),
          transaction.realtimeSession.count({
            where: {
              avatarAgentId: input.avatarAgentId,
              status: { in: [...activeStatuses] },
              OR: [{ publicSessionId: { not: null } }, { accessGrantId: { not: null } }],
            },
          }),
        ]);
        const expiresAt = decideExpiresAt({
          limits: {
            maxSessionDurationSeconds: grant.maxSessionDurationSeconds,
            maxSessionsPer24Hours: grant.maxSessionsPer24Hours,
          },
          usage,
          participantActive,
          avatarActive,
        });
        const conversation = await transaction.conversation.create({
          data: {
            ownerId: input.participantUserId,
            avatarAgentId: input.avatarAgentId,
            accessGrantId: grant.id,
            participantEmail: grant.participantEmail,
            visibility: "private",
            mode: "voice",
          },
          select: { id: true },
        });
        const realtimeSession = await transaction.realtimeSession.create({
          data: {
            avatarAgentId: input.avatarAgentId,
            conversationId: conversation.id,
            accessGrantId: grant.id,
            expiresAt,
          },
          select: { id: true },
        });

        return { conversation, realtimeSession, expiresAt };
      });
    },

    listSharedForProviderStop(now: Date, limit = 50, afterId?: string) {
      return db.realtimeSession.findMany({
        where: {
          ...(afterId ? { id: { gt: afterId } } : {}),
          providerStoppedAt: null,
          providerSessionTokenCiphertext: { not: null },
          accessGrantId: { not: null },
          OR: [
            { status: { in: ["ended", "errored"] } },
            { status: { in: [...activeStatuses] }, expiresAt: { lte: now } },
          ],
        },
        orderBy: { id: "asc" },
        take: limit,
        select: {
          id: true,
          status: true,
          conversationId: true,
          expiresAt: true,
          providerSessionTokenCiphertext: true,
        },
      });
    },

    listExpiredSharedForCleanup(now: Date, limit = 50, afterId?: string) {
      return db.realtimeSession.findMany({
        where: {
          ...(afterId ? { id: { gt: afterId } } : {}),
          status: { in: [...activeStatuses] },
          expiresAt: { lte: now },
          accessGrantId: { not: null },
        },
        orderBy: { id: "asc" },
        take: limit,
        select: { id: true, conversationId: true },
      });
    },
  };
}
