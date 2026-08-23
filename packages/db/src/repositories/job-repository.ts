import { Prisma, type JobType, type PrismaClient } from "@prisma/client";
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
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      };

      if (!input.dedupeKey) return db.job.create({ data });

      return db.job.upsert({
        where: { dedupeKey: input.dedupeKey },
        create: data,
        update: {},
      });
    },

    async claimNext(workerId = "worker", type?: JobType | JobType[]) {
      const types = type === undefined ? null : Array.isArray(type) ? type : [type];
      const typeFilter =
        types === null
          ? Prisma.empty
          : types.length === 0
            ? Prisma.sql`AND FALSE`
            : Prisma.sql`AND "type" IN (${Prisma.join(types.map((item) => Prisma.sql`${item}::"JobType"`))})`;
      const jobs = await db.$queryRaw<Array<Prisma.JobGetPayload<Record<string, never>>>>`
        UPDATE "Job"
        SET "status" = 'running'::"JobStatus",
            "attempts" = "attempts" + 1,
            "startedAt" = NOW(),
            "lockedAt" = NOW(),
            "lockedBy" = ${workerId},
            "updatedAt" = NOW()
        WHERE "id" = (
          SELECT "id"
          FROM "Job"
          WHERE "status" = 'queued'::"JobStatus"
            AND ("runAfter" IS NULL OR "runAfter" <= NOW())
            ${typeFilter}
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING *
      `;
      return jobs[0] ?? null;
    },

    markRunning(id: string) {
      return db.job.update({
        where: { id },
        data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
      });
    },

    markDone(id: string, payload?: Prisma.InputJsonObject) {
      return db.job.update({
        where: { id },
        data: {
          status: "done",
          finishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          errorMessage: null,
          ...(payload ? { payload } : {}),
        },
      });
    },

    markFailed(id: string, errorMessage: string) {
      return db.job.update({
        where: { id },
        data: {
          status: "failed",
          errorMessage,
          finishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
    },

    requeue(id: string, runAfter: Date, errorMessage: string) {
      return db.job.update({
        where: { id },
        data: {
          status: "queued",
          runAfter,
          errorMessage,
          startedAt: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
    },

    defer(id: string, runAfter: Date, reason: string) {
      return db.job.update({
        where: { id },
        data: {
          status: "queued",
          attempts: { decrement: 1 },
          runAfter,
          errorMessage: reason,
          startedAt: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
    },

    heartbeat(id: string, workerId: string) {
      return db.job.updateMany({
        where: { id, status: "running", lockedBy: workerId },
        data: { lockedAt: new Date() },
      });
    },

    runWithAvatarLock<T>(avatarId: string, operation: () => Promise<T>) {
      return db.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
            SELECT pg_try_advisory_xact_lock(
              hashtextextended(${`avatar-provider:${avatarId}`}, 0)
            ) AS "acquired"
          `;
          if (!rows[0]?.acquired) return { acquired: false as const };
          return { acquired: true as const, value: await operation() };
        },
        { maxWait: 5_000, timeout: 5 * 60_000 }
      );
    },

    retry(id: string) {
      return db.job.update({
        where: { id },
        data: {
          status: "queued",
          attempts: 0,
          runAfter: new Date(),
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
    },

    recoverStalled(lockedBefore: Date) {
      return db.job.updateMany({
        where: { status: "running", lockedAt: { lt: lockedBefore } },
        data: { status: "queued", lockedAt: null, lockedBy: null, startedAt: null },
      });
    },
  };
}
