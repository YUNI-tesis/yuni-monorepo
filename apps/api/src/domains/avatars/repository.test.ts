import type { PrismaClientInstance } from "@yuni/db";
import { OwnershipError } from "@yuni/domain";
import { describe, expect, it, vi } from "vitest";
import { createAvatarsRepository } from "./repository";

describe("avatar deletion lifecycle", () => {
  it("restarts the transaction when memberships change before the avatar lock is acquired", async () => {
    let transactionAttempt = 0;
    const tx = {
      avatarAgent: {
        findFirst: vi.fn(async () =>
          transactionAttempt === 1
            ? {
                id: "avatar-1",
                avatarGroupMembers: [{ id: "membership-1", avatarGroupId: "group-1" }],
              }
            : null
        ),
      },
      avatarGroupMember: {
        findMany: vi.fn(async (query: { include?: unknown }) =>
          query.include
            ? [
                {
                  id: "membership-1",
                  avatarGroupId: "group-1",
                  avatarGroup: {
                    members: [
                      { id: "membership-1", position: 0 },
                      { id: "membership-other-1", position: 1 },
                      { id: "membership-other-2", position: 2 },
                    ],
                  },
                },
              ]
            : [
                { id: "membership-1", avatarGroupId: "group-1" },
                { id: "membership-2", avatarGroupId: "group-2" },
              ]
        ),
      },
      groupVoiceSession: { findMany: vi.fn(async () => []) },
      $queryRaw: vi.fn(async () => []),
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => {
        transactionAttempt += 1;
        return operation(tx);
      }),
    } as unknown as PrismaClientInstance;

    const repository = createAvatarsRepository(prisma);

    await expect(repository.deleteWithCleanup!("owner-1", "avatar-1")).rejects.toBeInstanceOf(OwnershipError);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.avatarGroupMember.findMany).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
  });
});
