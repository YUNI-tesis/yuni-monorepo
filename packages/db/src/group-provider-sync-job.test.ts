import { describe, expect, it, vi } from "vitest";
import { enqueueGroupProviderSyncJob } from "./repositories/group-provider-sync-job";

describe("group provider sync job enqueueing", () => {
  it.each(["done", "failed"] as const)("requeues a terminal %s dedupe job", async (status) => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const upsert = vi.fn(async () => ({ id: "job-1", status }));
    const tx = {
      job: {
        upsert,
        updateMany,
      },
    };

    await enqueueGroupProviderSyncJob(tx as never, {
      ownerId: "owner-1",
      avatarAgentId: "avatar-1",
      dedupeKey: "group-agent-sync:avatar-1:revision-1",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: { in: ["done", "failed"] } },
      data: {
        status: "queued",
        attempts: 0,
        runAfter: expect.any(Date),
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: {
            avatarId: "avatar-1",
            syncRevision: "group-agent-sync:avatar-1:revision-1",
          },
        }),
      })
    );
  });

  it.each(["queued", "running"] as const)("leaves a %s dedupe job unchanged", async (status) => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const tx = {
      job: {
        upsert: vi.fn(async () => ({ id: "job-1", status })),
        updateMany,
      },
    };

    await enqueueGroupProviderSyncJob(tx as never, {
      ownerId: "owner-1",
      avatarAgentId: "avatar-1",
      dedupeKey: "group-agent-sync:avatar-1:revision-1",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: { in: ["done", "failed"] } },
      data: expect.objectContaining({ status: "queued", attempts: 0 }),
    });
  });
});
