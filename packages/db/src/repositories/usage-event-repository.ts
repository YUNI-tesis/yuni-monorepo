import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateUsageEventInput } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createUsageEventRepository(db: Db) {
  return {
    record(input: CreateUsageEventInput) {
      const data: Prisma.UsageEventUncheckedCreateInput = {
        avatarAgentId: input.avatarAgentId,
        provider: input.provider,
        operation: input.operation,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        audioSeconds: input.audioSeconds,
        costUsd: input.costUsd,
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.publicSessionId ? { publicSessionId: input.publicSessionId } : {}),
        ...(input.shareLinkId ? { shareLinkId: input.shareLinkId } : {}),
        ...(input.model ? { model: input.model } : {}),
      };

      return db.usageEvent.create({
        data,
      });
    },

    sumForAvatar(ownerId: string, avatarAgentId: string) {
      return db.usageEvent.aggregate({
        where: { ownerId, avatarAgentId },
        _sum: {
          tokensIn: true,
          tokensOut: true,
          audioSeconds: true,
          costUsd: true,
        },
        _count: true,
      });
    },

    async sumForShareLink(ownerId: string, shareLinkId: string) {
      const shareLink = await db.shareLink.findFirst({ where: { id: shareLinkId, ownerId } });
      if (!shareLink) return null;

      return db.usageEvent.aggregate({
        where: { shareLinkId },
        _sum: {
          tokensIn: true,
          tokensOut: true,
          audioSeconds: true,
          costUsd: true,
        },
        _count: true,
      });
    },
  };
}
