import { describe, expect, it, vi } from "vitest";
import { createAvatarGroupRepository } from "./repositories/avatar-group-repository";

describe("avatar group membership versioning", () => {
  it("does not recreate or version an unchanged ordered roster", async () => {
    const update = vi.fn(async ({ data }) => ({
      id: "group-1",
      ownerId: "owner-1",
      name: data.name,
      membershipVersion: 7,
      members: [],
    }));
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      avatarGroup: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "group-1",
            ownerId: "owner-1",
            members: [{ avatarAgentId: "avatar-1" }, { avatarAgentId: "avatar-2" }],
          })
          .mockResolvedValueOnce({ id: "group-1", ownerId: "owner-1" }),
        update,
      },
      accessGrant: { findMany: vi.fn(async () => []) },
      avatarAgent: { findMany: vi.fn(async () => []) },
      avatarGroupMember: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      groupShareLink: { count: vi.fn(async () => 0) },
      groupAccessGrant: { count: vi.fn(async () => 0) },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await repository.update("owner-1", "group-1", {
      name: "Nombre nuevo",
      avatarIds: ["avatar-1", "avatar-2"],
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Nombre nuevo" },
      })
    );
    expect(transaction.avatarAgent.findMany).not.toHaveBeenCalled();
    expect(transaction.avatarGroupMember.deleteMany).not.toHaveBeenCalled();
    expect(transaction.groupShareLink.count).not.toHaveBeenCalled();
    expect(transaction.groupAccessGrant.count).not.toHaveBeenCalled();
  });
});
