import { Prisma, type PrismaClient } from "@prisma/client";
import type { CreateAccessGrantInput, UpdateAccessGrantInput } from "@yuni/domain";
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
          ...(input.limits ?? {}),
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
      input: UpdateAccessGrantInput
    ) {
      return withTransaction(db, async (transaction) => {
        await lockAccessGrant(transaction, accessGrantId);
        const current = await transaction.accessGrant.findFirst({
          where: { id: accessGrantId, ownerId, avatarAgentId },
        });
        if (!current) throw new OwnershipError();

        const participant =
          input.status === "active" && current.participantUserId === null
            ? await transaction.user.findUnique({
                where: { email: current.participantEmail },
                select: { id: true },
              })
            : null;

        const data: Prisma.AccessGrantUncheckedUpdateInput = {};
        if (input.status !== undefined) {
          data.status = input.status;
          data.revokedAt = input.status === "revoked" ? new Date() : null;
        }
        if (input.limits !== undefined) {
          data.maxSessionDurationSeconds = input.limits.maxSessionDurationSeconds;
          data.maxSessionsPer24Hours = input.limits.maxSessionsPer24Hours;
        }
        if (participant) data.participantUserId = participant.id;

        return transaction.accessGrant.update({
          where: { id: accessGrantId },
          data,
        });
      });
    },

    deleteForAvatar(ownerId: string, avatarAgentId: string, accessGrantId: string) {
      return withTransaction(db, async (transaction) => {
        const grants = await transaction.$queryRaw<
          Array<{ id: string; status: "active" | "revoked"; revokedAt: Date | null }>
        >`
          SELECT "id", "status", "revokedAt"
          FROM "AccessGrant"
          WHERE "id" = ${accessGrantId}
            AND "ownerId" = ${ownerId}
            AND "avatarAgentId" = ${avatarAgentId}
          FOR UPDATE
        `;
        const current = grants[0];
        if (!current) throw new OwnershipError();

        const accessGrant = await transaction.accessGrant.update({
          where: { id: accessGrantId },
          data: {
            status: "revoked",
            revokedAt: current.revokedAt ?? new Date(),
          },
        });

        return { outcome: "revoked" as const, accessGrant };
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

async function lockAccessGrant(transaction: Prisma.TransactionClient, accessGrantId: string) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "AccessGrant" WHERE "id" = ${accessGrantId} FOR UPDATE`
  );
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
