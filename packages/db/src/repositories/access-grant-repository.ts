import type { AccessGrantStatus, Prisma, PrismaClient } from "@prisma/client";
import type { CreateAccessGrantInput } from "@yuni/domain";
import { OwnershipError, SelfAccessGrantError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createAccessGrantRepository(db: Db) {
  return {
    async create(ownerId: string, avatarAgentId: string, input: CreateAccessGrantInput) {
      const [avatar, participant] = await Promise.all([
        db.avatarAgent.findFirst({ where: { id: avatarAgentId, ownerId }, select: { id: true } }),
        db.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      ]);

      if (!avatar) throw new OwnershipError();
      if (participant?.id === ownerId) throw new SelfAccessGrantError();

      return db.accessGrant.create({
        data: {
          ownerId,
          avatarAgentId,
          participantEmail: input.email,
          participantUserId: participant?.id ?? null,
        },
      });
    },

    async listForAvatar(ownerId: string, avatarAgentId: string) {
      const avatar = await db.avatarAgent.findFirst({
        where: { id: avatarAgentId, ownerId },
        select: { id: true },
      });
      if (!avatar) throw new OwnershipError();

      return db.accessGrant.findMany({
        where: { ownerId, avatarAgentId },
        orderBy: { createdAt: "desc" },
      });
    },

    async updateForAvatar(
      ownerId: string,
      avatarAgentId: string,
      accessGrantId: string,
      status: AccessGrantStatus
    ) {
      const current = await db.accessGrant.findFirst({
        where: { id: accessGrantId, ownerId, avatarAgentId },
      });
      if (!current) throw new OwnershipError();

      const participant =
        status === "active" && current.participantUserId === null
          ? await db.user.findUnique({
              where: { email: current.participantEmail },
              select: { id: true },
            })
          : null;

      return db.accessGrant.update({
        where: { id: accessGrantId },
        data: {
          status,
          revokedAt: status === "revoked" ? new Date() : null,
          ...(participant ? { participantUserId: participant.id } : {}),
        },
      });
    },

    deleteForAvatar(ownerId: string, avatarAgentId: string, accessGrantId: string) {
      return withTransaction(db, async (transaction) => {
        const current = await transaction.accessGrant.findFirst({
          where: { id: accessGrantId, ownerId, avatarAgentId },
        });
        if (!current) throw new OwnershipError();

        const conversationCount = await transaction.conversation.count({
          where: { accessGrantId },
        });

        if (conversationCount > 0) {
          const accessGrant = await transaction.accessGrant.update({
            where: { id: accessGrantId },
            data: {
              status: "revoked",
              revokedAt: current.revokedAt ?? new Date(),
            },
          });

          return { outcome: "revoked" as const, accessGrant };
        }

        const accessGrant = await transaction.accessGrant.delete({ where: { id: accessGrantId } });
        return { outcome: "deleted" as const, accessGrant };
      });
    },

    linkActiveForUser(userId: string, participantEmail: string) {
      return db.accessGrant.updateMany({
        where: {
          participantEmail,
          participantUserId: null,
          status: "active",
        },
        data: { participantUserId: userId },
      });
    },
  };
}

async function withTransaction<T>(
  db: Db,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if ("$transaction" in db) {
    return db.$transaction(operation);
  }

  return operation(db);
}
