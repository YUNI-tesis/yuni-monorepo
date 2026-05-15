import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateAvatarAgentInput, UpdateAvatarAgentInput } from "@yuni/domain";
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

    listByOwner(ownerId: string) {
      return db.avatarAgent.findMany({
        where: { ownerId },
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
