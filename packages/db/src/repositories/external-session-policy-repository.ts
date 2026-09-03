import type { InteractionLimits } from "@yuni/domain";
import type { PrismaClient } from "@prisma/client";
import {
  countActiveExternalSessionsForAvatar,
  countActiveExternalSessionsForParticipant,
  lockExternalParticipant,
} from "./external-session-capacity";

type Db = PrismaClient;
const countedStatuses = ["connecting", "active", "ended"] as const;
const activeStatuses = ["connecting", "active"] as const;
const unconfirmedOwnerSessionGraceMs = 5 * 60_000;

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
        const avatars = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "AvatarAgent"
          WHERE "id" = ${input.avatarAgentId}
            AND "status" = 'active'::"AvatarStatus"
          FOR UPDATE
        `;
        if (!avatars[0]) return null;

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
          WHERE share_link."id" = ${input.shareLinkId}
            AND share_link."avatarAgentId" = ${input.avatarAgentId}
            AND share_link."isEnabled" = TRUE
          FOR UPDATE
        `;
        const link = links[0];
        if (!link) return null;

        const participantEmail = await lockExternalParticipant(transaction, input.participantEmail);

        const [usage, participantActive, avatarActive] = await Promise.all([
          transaction.publicSession.findMany({
            where: {
              status: { in: ["active", "ended"] },
              startedAt: { gt: input.since },
              shareLinkId: link.id,
              participantEmail,
            },
            select: { id: true, startedAt: true, endedAt: true },
            orderBy: { startedAt: "asc" },
          }),
          countActiveExternalSessionsForParticipant(transaction, participantEmail),
          countActiveExternalSessionsForAvatar(transaction, input.avatarAgentId),
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
            participantEmail,
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
            participantEmail,
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
        const avatars = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "AvatarAgent"
          WHERE "id" = ${input.avatarAgentId}
            AND "status" = 'active'::"AvatarStatus"
          FOR UPDATE
        `;
        if (!avatars[0]) return null;

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
          WHERE access_grant."id" = ${input.accessGrantId}
            AND access_grant."avatarAgentId" = ${input.avatarAgentId}
            AND access_grant."participantUserId" = ${input.participantUserId}
            AND access_grant."status" = 'active'::"AccessGrantStatus"
          FOR UPDATE
        `;
        const grant = grants[0];
        if (!grant) return null;

        const participantEmail = await lockExternalParticipant(transaction, grant.participantEmail);

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
          countActiveExternalSessionsForParticipant(transaction, participantEmail),
          countActiveExternalSessionsForAvatar(transaction, input.avatarAgentId),
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
            participantEmail,
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

    listPrivateForProviderStop(now: Date, limit = 50, afterId?: string) {
      const unconfirmedOwnerStartedBefore = new Date(now.getTime() - unconfirmedOwnerSessionGraceMs);
      return db.realtimeSession.findMany({
        where: {
          ...(afterId ? { id: { gt: afterId } } : {}),
          providerStoppedAt: null,
          providerSessionTokenCiphertext: { not: null },
          publicSessionId: null,
          groupVoiceParticipant: { is: null },
          OR: [
            { status: { in: ["ended", "errored"] } },
            {
              status: { in: [...activeStatuses] },
              expiresAt: { lte: now },
              accessGrantId: { not: null },
            },
            {
              status: "connecting",
              accessGrantId: null,
              startedAt: { lte: unconfirmedOwnerStartedBefore },
            },
          ],
        },
        orderBy: { id: "asc" },
        take: limit,
        select: {
          id: true,
          status: true,
          conversationId: true,
          expiresAt: true,
          accessGrantId: true,
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
