import { type Prisma } from "@prisma/client";

type EnqueueGroupProviderSyncJobInput = {
  ownerId: string;
  avatarAgentId: string;
  dedupeKey: string;
};

export async function enqueueGroupProviderSyncJob(
  tx: Prisma.TransactionClient,
  input: EnqueueGroupProviderSyncJobInput
) {
  const job = await tx.job.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      ownerId: input.ownerId,
      avatarAgentId: input.avatarAgentId,
      type: "group_agent_provider_sync",
      payload: { avatarId: input.avatarAgentId, syncRevision: input.dedupeKey },
      dedupeKey: input.dedupeKey,
      maxAttempts: 8,
    },
    update: {},
  });

  await tx.job.updateMany({
    where: { id: job.id, status: { in: ["done", "failed"] } },
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

  return job;
}
