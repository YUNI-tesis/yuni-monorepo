import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  createAvatarAgentRepository,
  enqueueActiveGroupProviderSyncForAvatar,
  enqueueSessionCleanup,
  terminateGroupVoiceSessionsForDeletion,
  type PrismaClientInstance,
} from "@yuni/db";
import type {
  AgentProvider,
  AvatarStatus,
  CreateAvatarAgentInput,
  LiveAvatarConfig,
  ProviderSyncStatus,
  UpdateAvatarAgentInput,
  VoiceConfig,
} from "@yuni/domain";

export type AvatarAgentRecord = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: unknown;
  liveAvatarConfig: unknown;
  agentProvider: AgentProvider;
  providerAgentId: string | null;
  providerSyncStatus: ProviderSyncStatus;
  providerSyncError: string | null;
  providerSyncedAt: Date | null;
  providerSyncFingerprint: string | null;
  providerLastUsableAt?: Date | null;
  providerContextDocumentId?: string | null;
  providerContextSyncStatus?: "pending" | "syncing" | "synced" | "failed" | "deleting";
  providerContextFingerprint?: string | null;
  status: AvatarStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AvatarAgentDto = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: VoiceConfig;
  liveAvatarConfig: LiveAvatarConfig;
  providerStatus: "preparing" | "ready" | "needs_attention";
  hasPreviousUsableVersion: boolean;
  status: AvatarStatus;
  createdAt: string;
  updatedAt: string;
};

export type AvatarListItemDto = {
  id: string;
  name: string;
  description: string;
  status: AvatarStatus;
  providerSyncStatus: ProviderSyncStatus;
  thumbnailUrl: string | null;
  interactionAvailability: AvatarInteractionAvailability;
  createdAt: string;
  updatedAt: string;
  access: {
    type: "owner" | "shared";
    canEdit: boolean;
    canShare: boolean;
    canInteract: boolean;
  };
};

export type AvatarInteractionAvailability = "ready" | "needs_attention" | "preparing" | "unavailable";

const AVATAR_MEMBERSHIP_RETRY_ATTEMPTS = 4;

class AvatarMembershipSnapshotChangedError extends Error {
  constructor() {
    super("Avatar group membership changed while deleting the avatar");
  }
}

export type AvatarAccessRecord =
  | {
      type: "owner";
      avatar: AvatarAgentRecord;
    }
  | {
      type: "shared";
      avatar: AvatarAgentRecord;
      accessGrant: {
        id: string;
        participantEmail: string;
        participantUserId: string | null;
        status: "active" | "revoked";
        maxSessionDurationSeconds?: number | null;
        maxSessionsPer24Hours?: number | null;
      };
    };

export type AvatarsRepository = {
  create(ownerId: string, input: CreateAvatarAgentInput): Promise<AvatarAgentRecord>;
  createWithProviderJobs?(ownerId: string, input: CreateAvatarAgentInput): Promise<AvatarAgentRecord>;
  listByOwner(ownerId: string): Promise<AvatarAgentRecord[]>;
  listSharedByUser?(participantUserId: string): Promise<AvatarAgentRecord[]>;
  findByIdForOwner(ownerId: string, avatarId: string): Promise<AvatarAgentRecord | null>;
  findAccessibleForUser(userId: string, avatarId: string): Promise<AvatarAccessRecord | null>;
  updateProviderSync(
    ownerId: string,
    avatarId: string,
    input: {
      agentProvider?: AgentProvider;
      providerAgentId?: string | null;
      providerSyncStatus: ProviderSyncStatus;
      providerSyncError?: string | null;
      providerSyncedAt?: Date | null;
      providerSyncFingerprint?: string | null;
      providerLastUsableAt?: Date | null;
    }
  ): Promise<AvatarAgentRecord>;
  updateForOwner(
    ownerId: string,
    avatarId: string,
    input: UpdateAvatarAgentInput
  ): Promise<AvatarAgentRecord>;
  updateWithProviderJobs?(
    ownerId: string,
    avatarId: string,
    input: UpdateAvatarAgentInput
  ): Promise<AvatarAgentRecord>;
  deleteForOwner(ownerId: string, avatarId: string): Promise<AvatarAgentRecord>;
  deleteWithCleanup?(ownerId: string, avatarId: string): Promise<AvatarAgentRecord>;
};

export function createAvatarsRepository(prisma: PrismaClientInstance): AvatarsRepository {
  const repository = createAvatarAgentRepository(prisma);
  return {
    ...repository,
    async createWithProviderJobs(ownerId, input) {
      return prisma.$transaction(async (tx) => {
        const created = await createAvatarAgentRepository(tx).create(ownerId, input);
        const avatar = await tx.avatarAgent.update({
          where: { id: created.id },
          data: { providerSyncStatus: "syncing", providerSyncError: null },
        });
        const contextFingerprint = hashContext(avatar.context);
        await tx.job.create({
          data: {
            ownerId,
            avatarAgentId: avatar.id,
            type: "avatar_context_provider_sync",
            payload: { avatarId: avatar.id, contextFingerprint },
            dedupeKey: `avatar-context:${avatar.id}:${contextFingerprint}`,
            maxAttempts: 8,
          },
        });
        await enqueueActiveGroupProviderSyncForAvatar(tx, {
          ownerId,
          avatarId: avatar.id,
          revision: `${hashAgentDraft(avatar)}:${avatar.updatedAt.getTime()}`,
        });
        return avatar;
      });
    },
    async updateWithProviderJobs(ownerId, avatarId, input) {
      return prisma.$transaction(async (tx) => {
        const avatarRepository = createAvatarAgentRepository(tx);
        const current = await tx.avatarAgent.findFirst({ where: { id: avatarId, ownerId } });
        if (!current) {
          const { OwnershipError } = await import("@yuni/domain");
          throw new OwnershipError();
        }
        const contextChanged = input.context !== undefined && input.context !== current.context;
        await avatarRepository.updateForOwner(ownerId, avatarId, input);
        const avatar = await tx.avatarAgent.update({
          where: { id: avatarId },
          data: {
            providerSyncStatus: "syncing",
            providerSyncError: null,
            ...(contextChanged
              ? {
                  providerContextSyncStatus: input.context ? ("pending" as const) : ("deleting" as const),
                  providerContextError: null,
                }
              : {}),
          },
        });
        await tx.job.create({
          data: contextChanged
            ? {
                ownerId,
                avatarAgentId: avatar.id,
                type: "avatar_context_provider_sync",
                payload: { avatarId: avatar.id, contextFingerprint: hashContext(avatar.context) },
                dedupeKey: `avatar-context:${avatar.id}:${hashContext(avatar.context)}:${avatar.updatedAt.getTime()}`,
                maxAttempts: 8,
              }
            : {
                ownerId,
                avatarAgentId: avatar.id,
                type: "agent_provider_sync",
                payload: { avatarId: avatar.id },
                dedupeKey: `agent-sync:${avatar.id}:${hashAgentDraft(avatar)}:${avatar.updatedAt.getTime()}`,
                maxAttempts: 8,
              },
        });
        await enqueueActiveGroupProviderSyncForAvatar(tx, {
          ownerId,
          avatarId: avatar.id,
          revision: `${hashAgentDraft(avatar)}:${avatar.updatedAt.getTime()}`,
        });
        return avatar;
      });
    },
    async deleteWithCleanup(ownerId, avatarId) {
      return retryAvatarMembershipSnapshotChange(() =>
        prisma.$transaction(async (tx) => {
          const snapshot = await tx.avatarAgent.findFirst({
            where: { id: avatarId, ownerId },
            select: {
              id: true,
              avatarGroupMembers: { select: { id: true, avatarGroupId: true } },
            },
          });
          if (!snapshot) {
            const { OwnershipError } = await import("@yuni/domain");
            throw new OwnershipError();
          }
          const groupIds = snapshot.avatarGroupMembers.map((membership) => membership.avatarGroupId);
          await lockRows(tx, "AvatarGroup", groupIds);
          await lockGroupSharingChannels(tx, groupIds);
          const affectedMemberships = await tx.avatarGroupMember.findMany({
            where: { avatarAgentId: avatarId },
            include: {
              avatarGroup: {
                include: { members: { orderBy: { position: "asc" } } },
              },
            },
          });
          const deletedGroupIds = affectedMemberships
            .filter(
              (membership) =>
                membership.avatarGroup.members.filter((member) => member.id !== membership.id).length < 2
            )
            .map((membership) => membership.avatarGroupId);
          const affectedSessionCandidates = await tx.groupVoiceSession.findMany({
            where: {
              status: { in: ["connecting", "active"] },
              OR: [
                { participants: { some: { avatarAgentId: avatarId } } },
                ...(deletedGroupIds.length > 0 ? [{ avatarGroupId: { in: deletedGroupIds } }] : []),
              ],
            },
            select: { id: true },
          });
          await lockGroupVoiceSessions(
            tx,
            affectedSessionCandidates.map((session) => session.id)
          );
          await lockRows(tx, "AvatarAgent", [avatarId]);
          const verifiedMemberships = await tx.avatarGroupMember.findMany({
            where: { avatarAgentId: avatarId },
            select: { id: true, avatarGroupId: true },
          });
          if (!sameMembershipSnapshot(snapshot.avatarGroupMembers, verifiedMemberships)) {
            throw new AvatarMembershipSnapshotChangedError();
          }
          const avatar = await tx.avatarAgent.findFirst({
            where: { id: avatarId, ownerId },
            include: { documents: { include: { providerSync: true } } },
          });
          if (!avatar) {
            const { OwnershipError } = await import("@yuni/domain");
            throw new OwnershipError();
          }
          const affectedSessions = await tx.groupVoiceSession.findMany({
            where: { id: { in: affectedSessionCandidates.map((session) => session.id) } },
            select: {
              id: true,
              avatarGroupId: true,
              status: true,
              participants: { select: { avatarAgentId: true, status: true } },
            },
          });
          const deletedGroupIdSet = new Set(deletedGroupIds);
          const terminatedSessionIds: string[] = [];
          const degradedSessionIds: string[] = [];
          for (const session of affectedSessions) {
            if (session.status !== "connecting" && session.status !== "active") continue;
            if (session.avatarGroupId && deletedGroupIdSet.has(session.avatarGroupId)) {
              terminatedSessionIds.push(session.id);
              continue;
            }
            const deletedParticipant = session.participants.find(
              (participant) => participant.avatarAgentId === avatarId
            );
            if (!deletedParticipant) continue;
            if (session.status === "connecting") {
              terminatedSessionIds.push(session.id);
              continue;
            }
            if (deletedParticipant.status !== "connecting" && deletedParticipant.status !== "active") {
              continue;
            }
            const remainingActiveParticipants = session.participants.filter(
              (participant) => participant.avatarAgentId !== avatarId && participant.status === "active"
            ).length;
            if (remainingActiveParticipants < 2) {
              terminatedSessionIds.push(session.id);
            } else {
              degradedSessionIds.push(session.id);
            }
          }
          const outstandingRealtimeSessions = await tx.realtimeSession.findMany({
            where: {
              avatarAgentId: avatarId,
              providerSessionTokenCiphertext: { not: null },
              providerStoppedAt: null,
            },
            include: {
              conversation: { select: { ownerId: true } },
              groupVoiceParticipant: {
                select: { groupVoiceSession: { select: { ownerId: true } } },
              },
            },
          });
          for (const realtime of outstandingRealtimeSessions) {
            await enqueueSessionCleanup(tx, {
              realtimeSessionId: realtime.id,
              providerSessionTokenCiphertext: realtime.providerSessionTokenCiphertext,
              ownerId:
                realtime.groupVoiceParticipant?.groupVoiceSession.ownerId ??
                realtime.conversation?.ownerId ??
                ownerId,
              avatarAgentId: avatarId,
            });
          }
          await terminateGroupVoiceSessionsForDeletion(tx, {
            sessionIds: terminatedSessionIds,
            errorMessage: "avatar_deleted",
          });
          await degradeGroupVoiceSessionsForAvatarDeletion(tx, {
            sessionIds: degradedSessionIds,
            avatarId,
            errorMessage: "avatar_deleted",
          });

          const primaryGroupConversations = await tx.conversation.findMany({
            where: {
              avatarAgentId: avatarId,
              conversationAvatars: { some: { avatarAgentId: { not: avatarId } } },
            },
            select: {
              id: true,
              conversationAvatars: {
                where: { avatarAgentId: { not: avatarId } },
                orderBy: { position: "asc" },
                take: 1,
                select: { avatarAgentId: true },
              },
            },
          });
          for (const conversation of primaryGroupConversations) {
            const replacement = conversation.conversationAvatars[0];
            if (replacement) {
              await tx.conversation.update({
                where: { id: conversation.id },
                data: { avatarAgentId: replacement.avatarAgentId },
              });
            }
          }

          const membershipChangedAt = new Date();
          for (const membership of affectedMemberships) {
            const remaining = membership.avatarGroup.members.filter((member) => member.id !== membership.id);
            if (remaining.length < 2) {
              await Promise.all([
                tx.groupShareLink.updateMany({
                  where: { avatarGroupId: membership.avatarGroupId, deletedAt: null },
                  data: { isEnabled: false, deletedAt: membershipChangedAt },
                }),
                tx.groupAccessGrant.updateMany({
                  where: { avatarGroupId: membership.avatarGroupId, status: "active" },
                  data: { status: "revoked", revokedAt: membershipChangedAt },
                }),
                tx.avatarGroup.update({
                  where: { id: membership.avatarGroupId },
                  data: { deletedAt: membershipChangedAt, membershipVersion: { increment: 1 } },
                }),
              ]);
              continue;
            }
            await tx.avatarGroupMember.delete({ where: { id: membership.id } });
            for (const [position, member] of remaining.entries()) {
              if (member.position === position) continue;
              await tx.avatarGroupMember.update({ where: { id: member.id }, data: { position } });
            }
            await tx.avatarGroup.update({
              where: { id: membership.avatarGroupId },
              data: { membershipVersion: { increment: 1 } },
            });
          }
          await tx.$executeRaw(
            Prisma.sql`
            UPDATE "Message" AS message
            SET "groupParticipantSnapshotId" = participant_snapshot."id"
            FROM "GroupConversationParticipantSnapshot" AS participant_snapshot
            WHERE message."speakerAvatarId" = ${avatarId}
              AND participant_snapshot."conversationId" = message."conversationId"
              AND participant_snapshot."sourceAvatarId" = message."speakerAvatarId"
              AND message."groupParticipantSnapshotId" IS NULL
          `
          );
          await tx.job.create({
            data: {
              ownerId,
              avatarAgentId: avatarId,
              type: "avatar_provider_cleanup",
              maxAttempts: 12,
              dedupeKey: `avatar-cleanup:${avatarId}`,
              payload: {
                providerAgentId: avatar.providerAgentId,
                groupProviderAgentId: avatar.groupProviderAgentId,
                providerContextDocumentId: avatar.providerContextDocumentId,
                documents: avatar.documents.map((document) => ({
                  storageKey: document.storageKey,
                  providerDocumentId: document.providerSync?.providerDocumentId ?? null,
                })),
              },
            },
          });
          return tx.avatarAgent.delete({ where: { id: avatarId } });
        })
      );
    },
  };
}

async function retryAvatarMembershipSnapshotChange<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= AVATAR_MEMBERSHIP_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof AvatarMembershipSnapshotChangedError)) throw error;
      if (attempt === AVATAR_MEMBERSHIP_RETRY_ATTEMPTS) throw error;
    }
  }
  throw new Error("Avatar deletion retry loop exhausted unexpectedly");
}

function sameMembershipSnapshot(
  before: Array<{ id: string; avatarGroupId: string }>,
  after: Array<{ id: string; avatarGroupId: string }>
) {
  if (before.length !== after.length) return false;
  const serialize = (membership: { id: string; avatarGroupId: string }) =>
    `${membership.avatarGroupId}:${membership.id}`;
  const expected = before.map(serialize).sort();
  const actual = after.map(serialize).sort();
  return expected.every((membership, index) => membership === actual[index]);
}

async function degradeGroupVoiceSessionsForAvatarDeletion(
  tx: Prisma.TransactionClient,
  input: { sessionIds: string[]; avatarId: string; errorMessage: string }
) {
  const sessionIds = [...new Set(input.sessionIds)].sort();
  if (sessionIds.length === 0) return;
  const sessions = await tx.groupVoiceSession.findMany({
    where: { id: { in: sessionIds }, status: "active" },
    include: {
      participants: {
        where: { avatarAgentId: input.avatarId },
        include: { realtimeSession: true },
      },
    },
  });
  const endedAt = new Date();
  for (const session of sessions) {
    const participant = session.participants[0];
    if (!participant || !["connecting", "active"].includes(participant.status)) continue;

    await tx.groupVoiceParticipantFailureEvent.createMany({
      data: {
        groupVoiceSessionId: session.id,
        sourceEventId: `avatar-deleted:${input.avatarId}`,
        avatarAgentId: input.avatarId,
        participantAttemptId: participant.realtimeSessionId,
        reason: input.errorMessage,
      },
      skipDuplicates: true,
    });
    await tx.groupVoiceParticipant.updateMany({
      where: { id: participant.id, status: { in: ["connecting", "active"] } },
      data: { status: "errored", errorMessage: input.errorMessage, endedAt },
    });
    if (participant.realtimeSession) {
      await tx.realtimeSession.updateMany({
        where: { id: participant.realtimeSession.id, status: { in: ["connecting", "active"] } },
        data: { status: "errored", errorMessage: input.errorMessage, endedAt },
      });
    }
    await tx.groupPlannedTurn.updateMany({
      where: {
        avatarAgentId: input.avatarId,
        status: "queued",
        round: {
          groupVoiceSessionId: session.id,
          status: { in: ["deliberating", "queued", "speaking"] },
        },
      },
      data: { status: "skipped", completedAt: endedAt },
    });

    if (session.floorOwnerAvatarId !== input.avatarId) continue;
    const floorTurn = session.floorTurnId
      ? await tx.groupPlannedTurn.findUnique({
          where: { id: session.floorTurnId },
          select: { id: true, roundId: true },
        })
      : null;
    if (floorTurn) {
      await tx.groupPlannedTurn.updateMany({
        where: { id: floorTurn.id, status: { in: ["queued", "claimed", "speaking"] } },
        data: { status: "failed", completedAt: endedAt },
      });
      await tx.groupPlannedTurn.updateMany({
        where: {
          roundId: floorTurn.roundId,
          id: { not: floorTurn.id },
          status: { in: ["queued", "claimed", "speaking"] },
        },
        data: { status: "interrupted", completedAt: endedAt },
      });
      await tx.groupVoiceRound.updateMany({
        where: { id: floorTurn.roundId, status: { in: ["deliberating", "queued", "speaking"] } },
        data: { status: "cancelled", completedAt: endedAt },
      });
    }
    await tx.groupVoiceSession.updateMany({
      where: {
        id: session.id,
        status: "active",
        floorOwnerAvatarId: input.avatarId,
      },
      data: {
        orchestrationPhase: "listening",
        floorOwnerAvatarId: null,
        floorTurnId: null,
        floorLeaseExpiresAt: null,
      },
    });
  }
}

async function lockRows(
  tx: Prisma.TransactionClient,
  table: "AvatarAgent" | "AvatarGroup",
  rowIds: string[]
) {
  const ids = [...new Set(rowIds)].sort();
  if (ids.length === 0) return;
  const tableName = Prisma.raw(`"${table}"`);
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM ${tableName} WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
  );
}

async function lockGroupSharingChannels(tx: Prisma.TransactionClient, groupIds: string[]) {
  const ids = [...new Set(groupIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "GroupShareLink" WHERE "avatarGroupId" IN (${Prisma.join(
      ids
    )}) ORDER BY "id" FOR UPDATE`
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "GroupAccessGrant" WHERE "avatarGroupId" IN (${Prisma.join(
      ids
    )}) ORDER BY "id" FOR UPDATE`
  );
}

async function lockGroupVoiceSessions(tx: Prisma.TransactionClient, sessionIds: string[]) {
  const ids = [...new Set(sessionIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "GroupVoiceSession" WHERE "id" IN (${Prisma.join(
      ids
    )}) ORDER BY "id" FOR UPDATE`
  );
}

function hashContext(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashAgentDraft(avatar: AvatarAgentRecord) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        name: avatar.name,
        description: avatar.description,
        instructions: avatar.instructions,
        context: avatar.context,
        voiceConfig: avatar.voiceConfig,
      })
    )
    .digest("hex");
}

export function toAvatarAgentDto(record: AvatarAgentRecord): AvatarAgentDto {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    instructions: record.instructions,
    context: record.context,
    voiceConfig: record.voiceConfig as VoiceConfig,
    liveAvatarConfig: record.liveAvatarConfig as LiveAvatarConfig,
    providerStatus:
      record.providerSyncStatus === "synced" || record.providerLastUsableAt
        ? "ready"
        : record.providerSyncStatus === "failed"
          ? "needs_attention"
          : "preparing",
    hasPreviousUsableVersion: Boolean(record.providerLastUsableAt),
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
