import { describe, expect, it, vi } from "vitest";
import { createAvatarGroupRepository } from "./repositories/avatar-group-repository";

const locator = {
  avatarGroupId: "group-1",
  groupAccessGrantId: "grant-1",
  groupPublicSessionId: null,
};

function connectingSession(overrides: Partial<typeof locator> = {}) {
  return {
    ...locator,
    ...overrides,
    status: "connecting",
    activatedAt: null,
    expiresAt: new Date("2030-08-31T13:00:00.000Z"),
    avatarGroup: { deletedAt: null, membershipVersion: 3 },
    conversation: { groupMembershipVersion: 3 },
    groupAccessGrant: { avatarGroupId: "group-1", status: "active" },
    participants: [
      {
        status: "active",
        realtimeSession: { activatedAt: new Date("2026-08-31T12:00:00.000Z") },
        avatarAgent: {
          status: "active",
          groupProviderAgentId: "provider-one",
          groupProviderSyncStatus: "synced",
        },
      },
      {
        status: "active",
        realtimeSession: { activatedAt: new Date("2026-08-31T12:00:01.000Z") },
        avatarAgent: {
          status: "active",
          groupProviderAgentId: "provider-two",
          groupProviderSyncStatus: "synced",
        },
      },
    ],
    groupPublicSession: null,
  };
}

function queryTable(query: unknown) {
  const strings =
    typeof query === "object" && query !== null && "strings" in query
      ? (query as { strings: readonly string[] }).strings
      : Array.isArray(query)
        ? query
        : [];
  const sql = strings.join(" ");
  return ["AvatarGroup", "GroupShareLink", "GroupAccessGrant", "GroupVoiceSession"].find((table) =>
    sql.includes(`"${table}"`)
  );
}

describe("avatar group activation lock order", () => {
  it("locks group and sharing channels before the voice session", async () => {
    const events: string[] = [];
    const findUnique = vi
      .fn()
      .mockImplementationOnce(async () => {
        events.push("read:locator");
        return locator;
      })
      .mockImplementationOnce(async () => {
        events.push("read:session");
        return connectingSession();
      });
    const transaction = {
      $queryRaw: vi.fn(async (query: unknown) => {
        events.push(`lock:${queryTable(query)}`);
        return [];
      }),
      groupVoiceSession: {
        findUnique,
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => {
          events.push("activate");
          return { count: 1 };
        }),
      },
      groupShareLink: { updateMany: vi.fn(async () => ({ count: 0 })) },
      groupAccessGrant: {
        updateMany: vi.fn(async () => {
          events.push("touch:grant");
          return { count: 1 };
        }),
      },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.markSessionActive("voice-1")).resolves.toBe(true);
    expect(events).toEqual([
      "read:locator",
      "lock:AvatarGroup",
      "lock:GroupShareLink",
      "lock:GroupAccessGrant",
      "lock:GroupVoiceSession",
      "read:session",
      "activate",
      "touch:grant",
    ]);
  });

  it("does not activate when the locked session no longer matches its locator", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      groupVoiceSession: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(locator)
          .mockResolvedValueOnce(connectingSession({ groupAccessGrantId: "grant-2" })),
        findMany: vi.fn(async () => []),
        updateMany,
      },
      groupShareLink: { updateMany: vi.fn() },
      groupAccessGrant: { updateMany: vi.fn() },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.markSessionActive("voice-1")).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
    expect(transaction.groupAccessGrant.updateMany).not.toHaveBeenCalled();
  });

  it("does not count an active participant without a confirmed realtime attempt", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      groupVoiceSession: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(locator)
          .mockResolvedValueOnce({
            ...connectingSession(),
            participants: [
              {
                status: "active",
                realtimeSession: null,
                avatarAgent: {
                  status: "active",
                  groupProviderAgentId: "provider-one",
                  groupProviderSyncStatus: "synced",
                },
              },
              {
                status: "active",
                realtimeSession: { activatedAt: new Date("2026-08-31T12:00:01.000Z") },
                avatarAgent: {
                  status: "active",
                  groupProviderAgentId: "provider-two",
                  groupProviderSyncStatus: "synced",
                },
              },
            ],
          }),
        findMany: vi.fn(async () => []),
        updateMany,
      },
      groupShareLink: { updateMany: vi.fn() },
      groupAccessGrant: { updateMany: vi.fn() },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.markSessionActive("voice-1")).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does not activate a connecting session after its grant is revoked", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      groupVoiceSession: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(locator)
          .mockResolvedValueOnce({
            ...connectingSession(),
            groupAccessGrant: { avatarGroupId: "group-1", status: "revoked" },
          }),
        findMany: vi.fn(async () => []),
        updateMany,
      },
      groupShareLink: { updateMany: vi.fn() },
      groupAccessGrant: { updateMany: vi.fn() },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.markSessionActive("voice-1")).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("avatar group participant cleanup lock order", () => {
  it("locks the voice session before mutating a failed participant and enqueueing cleanup", async () => {
    const events: string[] = [];
    const transaction = {
      $queryRaw: vi.fn(async () => {
        events.push("lock:GroupVoiceSession");
        return [];
      }),
      groupVoiceParticipant: {
        findUnique: vi
          .fn()
          .mockImplementationOnce(async () => {
            events.push("read:locator");
            return { groupVoiceSessionId: "voice-1" };
          })
          .mockImplementationOnce(async () => {
            events.push("read:participant");
            return {
              id: "participant-1",
              avatarAgentId: "avatar-1",
              groupVoiceSessionId: "voice-1",
              groupVoiceSession: { ownerId: "owner-1" },
            };
          }),
        updateMany: vi.fn(async () => {
          events.push("update:participant");
          return { count: 1 };
        }),
      },
      realtimeSession: {
        updateMany: vi.fn(async () => {
          events.push("update:realtime");
          return { count: 1 };
        }),
      },
      job: {
        upsert: vi.fn(async () => {
          events.push("enqueue:cleanup");
          return {};
        }),
      },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await repository.abandonParticipantConnection(
      "participant-1",
      "realtime-1",
      "provider-session-1",
      "encrypted-token",
      "provider failed"
    );

    expect(events).toEqual([
      "read:locator",
      "lock:GroupVoiceSession",
      "read:participant",
      "update:participant",
      "update:realtime",
      "enqueue:cleanup",
    ]);
  });
});
