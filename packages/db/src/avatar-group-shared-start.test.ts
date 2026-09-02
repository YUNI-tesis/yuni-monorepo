import { describe, expect, it, vi } from "vitest";
import { GroupVoiceRosterUnavailableError } from "./repositories/avatar-group-repository";
import { createAvatarGroupRepository } from "./repositories/avatar-group-repository";

function member(id: string, voiceConfig: unknown = validVoiceConfig(id)) {
  return {
    id: `membership-${id}`,
    avatarAgentId: `avatar-${id}`,
    accessGrantId: null,
    position: id === "one" ? 0 : 1,
    accessGrant: null,
    avatarAgent: {
      id: `avatar-${id}`,
      ownerId: "owner-1",
      name: `Avatar ${id}`,
      description: "Especialista",
      status: "active",
      updatedAt: new Date("2030-01-01T00:00:00.000Z"),
      liveAvatarConfig: {
        provider: "liveavatar",
        avatarId: `live-${id}`,
        mode: "lite",
        sandbox: true,
      },
      voiceConfig,
      groupProviderAgentId: `provider-${id}`,
      groupProviderSyncStatus: "synced",
      documents: [],
      avatarGroupMembers: [{ id: `membership-${id}` }],
    },
  };
}

function validVoiceConfig(id: string) {
  return { provider: "elevenlabs", voiceId: `voice-${id}`, speakingRate: 1 };
}

describe("shared avatar group start validation", () => {
  it("re-reads every member after locking and rejects a newly invalid provider configuration", async () => {
    const readyGroup = {
      id: "group-1",
      ownerId: "owner-1",
      name: "Consejo",
      membershipVersion: 4,
      deletedAt: null,
      members: [member("one"), member("two")],
    };
    const lockedGroup = {
      ...readyGroup,
      members: [member("one"), member("two", { provider: "unsupported" })],
    };
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      groupAccessGrant: {
        findFirst: vi.fn().mockResolvedValueOnce({ id: "grant-1" }).mockResolvedValueOnce({
          id: "grant-1",
          ownerId: "owner-1",
          participantEmail: "person@example.com",
          participantUserId: "participant-1",
          status: "active",
          maxSessionDurationSeconds: null,
          maxSessionsPer24Hours: null,
        }),
      },
      avatarGroup: {
        findFirst: vi.fn().mockResolvedValueOnce(readyGroup).mockResolvedValueOnce(lockedGroup),
      },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.createSharedVoiceSession(
        "participant-1",
        "group-1",
        { scopeId: "group-access-grant:grant-1", version: "4" },
        60
      )
    ).rejects.toBeInstanceOf(GroupVoiceRosterUnavailableError);

    expect(transaction.avatarGroup.findFirst).toHaveBeenCalledTimes(2);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it("fences inline provider state updates by the expected sharing revision", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const repository = createAvatarGroupRepository({ avatarAgent: { updateMany } } as never);

    await expect(
      repository.updateGroupProvider(
        "avatar-one",
        { status: "synced", agentId: "provider-one", fingerprint: "fingerprint-one" },
        "revision-one"
      )
    ).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "avatar-one", groupProviderSyncRevision: "revision-one" },
      })
    );
  });

  it("can atomically claim the provider projection with a unique inline revision", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const repository = createAvatarGroupRepository({ avatarAgent: { updateMany } } as never);

    await expect(
      repository.updateGroupProvider(
        "avatar-one",
        { status: "syncing", revision: "inline:session:participant:new" },
        "previous-revision"
      )
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "avatar-one", groupProviderSyncRevision: "previous-revision" },
      data: expect.objectContaining({
        groupProviderSyncStatus: "syncing",
        groupProviderSyncRevision: "inline:session:participant:new",
      }),
    });
  });
});
