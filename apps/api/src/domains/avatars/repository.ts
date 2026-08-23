import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  createAvatarAgentRepository,
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
        return avatar;
      });
    },
    async deleteWithCleanup(ownerId, avatarId) {
      return prisma.$transaction(async (tx) => {
        const snapshot = await tx.avatarAgent.findFirst({
          where: { id: avatarId, ownerId },
          select: {
            id: true,
            avatarGroupMembers: { select: { avatarGroupId: true } },
          },
        });
        if (!snapshot) {
          const { OwnershipError } = await import("@yuni/domain");
          throw new OwnershipError();
        }
        await lockRows(tx, "AvatarAgent", [avatarId]);
        const lockedMemberships = await tx.avatarGroupMember.findMany({
          where: { avatarAgentId: avatarId },
          select: { avatarGroupId: true },
        });
        await lockRows(
          tx,
          "AvatarGroup",
          lockedMemberships.map((membership) => membership.avatarGroupId)
        );
        const avatar = await tx.avatarAgent.findFirst({
          where: { id: avatarId, ownerId },
          include: { documents: { include: { providerSync: true } } },
        });
        if (!avatar) {
          const { OwnershipError } = await import("@yuni/domain");
          throw new OwnershipError();
        }

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
        const affectedSessionWhere: Prisma.GroupVoiceSessionWhereInput = {
          OR: [
            {
              status: { in: ["connecting", "active"] },
              participants: { some: { avatarAgentId: avatarId } },
            },
            ...(deletedGroupIds.length > 0 ? [{ avatarGroupId: { in: deletedGroupIds } }] : []),
          ],
        };
        const affectedSessionIds = await tx.groupVoiceSession.findMany({
          where: affectedSessionWhere,
          select: { id: true },
        });
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
          sessionIds: affectedSessionIds.map((session) => session.id),
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

        for (const membership of affectedMemberships) {
          const remaining = membership.avatarGroup.members.filter((member) => member.id !== membership.id);
          if (remaining.length < 2) {
            await tx.avatarGroup.delete({ where: { id: membership.avatarGroupId } });
            continue;
          }
          await tx.avatarGroupMember.delete({ where: { id: membership.id } });
          for (const [position, member] of remaining.entries()) {
            if (member.position === position) continue;
            await tx.avatarGroupMember.update({ where: { id: member.id }, data: { position } });
          }
        }
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
      });
    },
  };
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
