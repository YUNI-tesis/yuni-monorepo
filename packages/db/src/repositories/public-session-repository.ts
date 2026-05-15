import type { Prisma, PrismaClient, ShareLink } from "@prisma/client";
import { PublicLinkDisabledError } from "@yuni/domain";

type Db = PrismaClient;

export function createPublicSessionRepository(db: Db) {
  return {
    async createFromEnabledShareLink(
      shareLink: Pick<ShareLink, "id" | "avatarAgentId" | "isEnabled">,
      anonymousId: string
    ) {
      if (!shareLink.isEnabled) throw new PublicLinkDisabledError();

      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const publicSession = await tx.publicSession.create({
          data: {
            shareLinkId: shareLink.id,
            avatarAgentId: shareLink.avatarAgentId,
            anonymousId,
          },
        });

        await tx.shareLink.update({
          where: { id: shareLink.id },
          data: { lastUsedAt: publicSession.startedAt },
        });

        return publicSession;
      });
    },

    findActive(sessionId: string) {
      return db.publicSession.findFirst({
        where: { id: sessionId, status: "active" },
        include: { shareLink: true, avatarAgent: true, conversation: true },
      });
    },

    end(sessionId: string) {
      return db.publicSession.update({
        where: { id: sessionId },
        data: { status: "ended", endedAt: new Date() },
      });
    },

    block(sessionId: string) {
      return db.publicSession.update({
        where: { id: sessionId },
        data: { status: "blocked", endedAt: new Date() },
      });
    },
  };
}
