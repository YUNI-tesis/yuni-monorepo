import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AgentProvider,
  CreateAvatarAgentInput,
  ProviderSyncStatus,
  UpdateAvatarAgentInput,
} from "@yuni/domain";
import { OwnershipError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createAvatarAgentRepository(db: Db) {
  return {
    create(ownerId: string, input: CreateAvatarAgentInput) {
      return db.avatarAgent.create({
        data: {
          ownerId,
          name: input.name,
          description: input.description,
          instructions: input.instructions,
          context: input.context,
          voiceConfig: input.voiceConfig,
          liveAvatarConfig: input.liveAvatarConfig,
          status: input.status,
        },
      });
    },

    findByIdForOwner(ownerId: string, avatarAgentId: string) {
      return db.avatarAgent.findFirst({
        where: { id: avatarAgentId, ownerId },
      });
    },

    async findAccessibleForUser(userId: string, avatarAgentId: string) {
      const avatar = await db.avatarAgent.findUnique({
        where: { id: avatarAgentId },
        include: {
          accessGrants: {
            where: {
              participantUserId: userId,
              status: "active",
            },
            take: 1,
          },
        },
      });

      if (!avatar) return null;

      const { accessGrants, ...avatarRecord } = avatar;

      if (avatar.ownerId === userId) {
        return { type: "owner" as const, avatar: avatarRecord };
      }

      const accessGrant = accessGrants[0];

      if (avatar.status !== "active" || !accessGrant) {
        return null;
      }

      return {
        type: "shared" as const,
        avatar: avatarRecord,
        accessGrant,
      };
    },

    async updateProviderSync(
      ownerId: string,
      avatarAgentId: string,
      input: {
        agentProvider?: AgentProvider;
        providerAgentId?: string | null;
        providerSyncStatus: ProviderSyncStatus;
        providerSyncError?: string | null;
        providerSyncedAt?: Date | null;
        providerSyncFingerprint?: string | null;
      }
    ) {
      const current = await this.findByIdForOwner(ownerId, avatarAgentId);
      if (!current) throw new OwnershipError();

      const data: Prisma.AvatarAgentUncheckedUpdateInput = {
        providerSyncStatus: input.providerSyncStatus,
        providerSyncError: input.providerSyncError ?? null,
      };

      if (input.agentProvider !== undefined) data.agentProvider = input.agentProvider;
      if (input.providerAgentId !== undefined) data.providerAgentId = input.providerAgentId;
      if (input.providerSyncedAt !== undefined) data.providerSyncedAt = input.providerSyncedAt;
      if (input.providerSyncFingerprint !== undefined) {
        data.providerSyncFingerprint = input.providerSyncFingerprint;
      }

      return db.avatarAgent.update({
        where: { id: avatarAgentId },
        data,
      });
    },

    listByOwner(ownerId: string) {
      return db.avatarAgent.findMany({
        where: { ownerId },
        orderBy: { updatedAt: "desc" },
      });
    },

    listSharedByUser(participantUserId: string) {
      return db.avatarAgent.findMany({
        where: {
          status: "active",
          accessGrants: {
            some: {
              participantUserId,
              status: "active",
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    },

    async updateForOwner(ownerId: string, avatarAgentId: string, input: UpdateAvatarAgentInput) {
      const current = await this.findByIdForOwner(ownerId, avatarAgentId);
      if (!current) throw new OwnershipError();

      const data: Prisma.AvatarAgentUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.instructions !== undefined) data.instructions = input.instructions;
      if (input.context !== undefined) data.context = input.context;
      if (input.voiceConfig !== undefined) data.voiceConfig = input.voiceConfig;
      if (input.liveAvatarConfig !== undefined) data.liveAvatarConfig = input.liveAvatarConfig;
      if (input.status !== undefined) data.status = input.status;

      return db.avatarAgent.update({
        where: { id: avatarAgentId },
        data,
      });
    },

    async deleteForOwner(ownerId: string, avatarAgentId: string) {
      const current = await this.findByIdForOwner(ownerId, avatarAgentId);
      if (!current) throw new OwnershipError();

      return db.avatarAgent.delete({
        where: { id: avatarAgentId },
      });
    },
  };
}
