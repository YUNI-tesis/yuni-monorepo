import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateShareLinkInput, UpdateShareLinkInput } from "@yuni/domain";
import { OwnershipError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createShareLinkRepository(db: Db) {
  return {
    async create(ownerId: string, avatarAgentId: string, input: CreateShareLinkInput) {
      const avatar = await db.avatarAgent.findFirst({ where: { id: avatarAgentId, ownerId } });
      if (!avatar) throw new OwnershipError();

      return db.shareLink.create({
        data: {
          ownerId,
          avatarAgentId,
          slug: input.slug,
          name: input.name,
          isEnabled: input.isEnabled,
          ...(input.limits ?? {}),
        },
      });
    },

    async listForAvatar(ownerId: string, avatarAgentId: string) {
      const avatar = await db.avatarAgent.findFirst({ where: { id: avatarAgentId, ownerId } });
      if (!avatar) throw new OwnershipError();

      return db.shareLink.findMany({
        where: { ownerId, avatarAgentId },
        orderBy: { createdAt: "desc" },
      });
    },

    async updateForAvatar(
      ownerId: string,
      avatarAgentId: string,
      shareLinkId: string,
      input: UpdateShareLinkInput
    ) {
      const current = await db.shareLink.findFirst({
        where: { id: shareLinkId, ownerId, avatarAgentId },
      });
      if (!current) throw new OwnershipError();

      const data: Prisma.ShareLinkUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
      if (input.limits !== undefined) {
        data.maxSessionDurationSeconds = input.limits.maxSessionDurationSeconds;
        data.maxSessionsPer24Hours = input.limits.maxSessionsPer24Hours;
      }

      return db.shareLink.update({
        where: { id: shareLinkId },
        data,
      });
    },

    async deleteForAvatar(ownerId: string, avatarAgentId: string, shareLinkId: string) {
      const current = await db.shareLink.findFirst({
        where: { id: shareLinkId, ownerId, avatarAgentId },
      });
      if (!current) throw new OwnershipError();

      return db.shareLink.delete({
        where: { id: shareLinkId },
      });
    },

    resolveEnabledBySlug(slug: string) {
      return db.shareLink.findFirst({
        where: {
          slug,
          isEnabled: true,
          avatarAgent: { status: "active" },
        },
        include: { avatarAgent: true },
      });
    },
  };
}
