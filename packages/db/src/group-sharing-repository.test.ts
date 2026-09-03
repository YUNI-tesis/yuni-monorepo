import { describe, expect, it, vi } from "vitest";
import { createGroupSharingRepository } from "./repositories/group-sharing-repository";

function setup(
  activeGrantCount: number,
  providerState: {
    status: "synced" | "syncing";
    revision?: string | null;
    updatedAt?: Date;
  } = { status: "synced" }
) {
  const members = ["one", "two"].map((id, position) => ({
    id: `membership-${id}`,
    avatarAgentId: `avatar-${id}`,
    accessGrantId: null,
    position,
    avatarAgent: {
      id: `avatar-${id}`,
      ownerId: "owner-1",
      status: "active",
      updatedAt: providerState.updatedAt ?? new Date("2030-01-01T00:00:00.000Z"),
      groupProviderAgentId: `provider-${id}`,
      groupProviderSyncStatus: providerState.status,
      groupProviderSyncRevision: providerState.revision ?? null,
    },
  }));
  const group = {
    id: "group-1",
    ownerId: "owner-1",
    name: "Consejo",
    membershipVersion: 3,
    members,
  };
  const transaction = {
    $queryRaw: vi.fn(async () => []),
    avatarGroup: { findFirst: vi.fn(async () => group) },
    groupShareLink: {
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }) => ({ id: "link-1", ...data })),
    },
    groupAccessGrant: { count: vi.fn(async () => activeGrantCount) },
    avatarAgent: { update: vi.fn(async () => ({})) },
    job: {
      upsert: vi.fn(async () => ({ id: "job-1", status: "queued" })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const db = {
    $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction)
    ),
  };
  return { repository: createGroupSharingRepository(db as never), transaction };
}

describe("group sharing provider preparation", () => {
  it("forces every synced member back through preparation when enabling the first channel", async () => {
    const { repository, transaction } = setup(0);

    await repository.createShareLink("owner-1", "group-1", {
      name: "Consejo público",
      slug: "consejo-publico",
      isEnabled: true,
    });

    expect(transaction.avatarAgent.update).toHaveBeenCalledTimes(2);
    expect(transaction.job.upsert).toHaveBeenCalledTimes(2);
  });

  it("keeps synced members available when adding another active channel", async () => {
    const { repository, transaction } = setup(1);

    await repository.createShareLink("owner-1", "group-1", {
      name: "Otro link",
      slug: "otro-link",
      isEnabled: true,
    });

    expect(transaction.avatarAgent.update).not.toHaveBeenCalled();
    expect(transaction.job.upsert).not.toHaveBeenCalled();
  });

  it("does not replace the revision of an in-flight sharing projection", async () => {
    const { repository, transaction } = setup(1, {
      status: "syncing",
      revision: "group-agent-sync:avatar-one:content:current",
    });

    await repository.createShareLink("owner-1", "group-1", {
      name: "Otro link",
      slug: "otro-link",
      isEnabled: true,
    });

    expect(transaction.avatarAgent.update).not.toHaveBeenCalled();
    expect(transaction.job.upsert).not.toHaveBeenCalled();
  });

  it("rejects first-channel activation while a private inline projection is in flight", async () => {
    const { repository, transaction } = setup(0, {
      status: "syncing",
      revision: "inline:session-1:participant-1:new",
    });

    await expect(
      repository.createShareLink("owner-1", "group-1", {
        name: "Consejo público",
        slug: "consejo-publico",
        isEnabled: true,
      })
    ).rejects.toMatchObject({ name: "GroupSharingPreparationBusyError" });

    expect(transaction.avatarAgent.update).not.toHaveBeenCalled();
    expect(transaction.job.upsert).not.toHaveBeenCalled();
  });

  it("recovers an abandoned inline projection when enabling the first channel", async () => {
    const { repository, transaction } = setup(0, {
      status: "syncing",
      revision: "inline:abandoned-session:participant-1:new",
      updatedAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    await repository.createShareLink("owner-1", "group-1", {
      name: "Consejo público",
      slug: "consejo-publico",
      isEnabled: true,
    });

    expect(transaction.avatarAgent.update).toHaveBeenCalledTimes(2);
    expect(transaction.job.upsert).toHaveBeenCalledTimes(2);
  });
});
