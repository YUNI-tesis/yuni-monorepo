import type { JobType, Prisma, PrismaClient } from "@prisma/client";
import type { CreateJobInput } from "@yuni/domain";

type Db = PrismaClient;

export function createJobRepository(db: Db) {
  return {
    enqueue(input: CreateJobInput) {
      const data: Prisma.JobUncheckedCreateInput = {
        type: input.type,
        payload: input.payload as Prisma.InputJsonObject,
        maxAttempts: input.maxAttempts,
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
        ...(input.avatarAgentId ? { avatarAgentId: input.avatarAgentId } : {}),
        ...(input.runAfter ? { runAfter: input.runAfter } : {}),
      };

      return db.job.create({
        data,
      });
    },

    claimNext(type?: JobType) {
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        const job = await tx.job.findFirst({
          where: {
            status: "queued",
            ...(type ? { type } : {}),
            OR: [{ runAfter: null }, { runAfter: { lte: new Date() } }],
          },
          orderBy: { createdAt: "asc" },
        });

        if (!job) return null;

        return tx.job.update({
          where: { id: job.id },
          data: {
            status: "running",
            attempts: { increment: 1 },
            startedAt: new Date(),
          },
        });
      });
    },

    markRunning(id: string) {
      return db.job.update({
        where: { id },
        data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
      });
    },

    markDone(id: string) {
      return db.job.update({
        where: { id },
        data: { status: "done", finishedAt: new Date() },
      });
    },

    markFailed(id: string, errorMessage: string) {
      return db.job.update({
        where: { id },
        data: { status: "failed", errorMessage, finishedAt: new Date() },
      });
    },
  };
}
