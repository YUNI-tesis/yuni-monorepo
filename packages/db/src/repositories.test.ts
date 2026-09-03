import { describe, expect, it, vi } from "vitest";
import { prisma } from "./client";
import { createAccessGrantRepository } from "./repositories/access-grant-repository";
import { createAvatarGroupRepository } from "./repositories/avatar-group-repository";
import { createConversationRepository } from "./repositories/conversation-repository";
import { createMessageRepository } from "./repositories/message-repository";
import { createExternalSessionPolicyRepository } from "./repositories/external-session-policy-repository";
import { createPublicSessionRepository } from "./repositories/public-session-repository";
import { createRealtimeSessionRepository } from "./repositories/realtime-session-repository";
import { createUserRepository } from "./repositories/user-repository";

describe("@yuni/db repository contracts", () => {
  it("keeps group conversations out of individual avatar history queries", async () => {
    type ConversationQuery = { where: Record<string, unknown> };
    const findFirst = vi.fn(async (_query: ConversationQuery) => null);
    const findMany = vi.fn(async (_query: ConversationQuery) => []);
    const repository = createConversationRepository({
      conversation: { findFirst, findMany },
    } as never);

    await repository.findLatestPrivate("owner-1", "avatar-1");
    await repository.findLatestPrivateForAccess("owner-1", "avatar-1", null);
    await repository.listPrivateForAvatar("owner-1", "avatar-1");
    await repository.listPrivateForAccess("owner-1", "avatar-1", null);
    await repository.findPrivateIdentityById("conversation-1");
    await repository.findPrivateById("owner-1", "conversation-1");
    await repository.findPrivateByIdForAccess("owner-1", "conversation-1", null);

    for (const [query] of [...findFirst.mock.calls, ...findMany.mock.calls]) {
      expect(query.where).toMatchObject({ avatarGroupId: null });
    }
  });

  it("expires abandoned connecting and active group calls before their hard deadline", async () => {
    const findMany = vi.fn(async () => []);
    const repository = createAvatarGroupRepository({ groupVoiceSession: { findMany } } as never);
    const now = new Date("2030-01-01T12:00:00.000Z");

    await repository.listExpiredVoiceSessions(now);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["connecting", "active"] },
        OR: [
          { expiresAt: { lte: now } },
          { status: "connecting", startedAt: { lte: new Date("2030-01-01T11:55:00.000Z") } },
          { status: "active", lastHeartbeatAt: { lte: new Date("2030-01-01T11:58:00.000Z") } },
        ],
      },
      include: { participants: { include: { realtimeSession: true } } },
    });
  });

  it("revalidates a voice-session timeout atomically before claiming cleanup", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const findUniqueOrThrow = vi.fn();
    const transaction = {
      groupVoiceSession: { updateMany, findUniqueOrThrow },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);
    const now = new Date("2030-01-01T12:00:00.000Z");

    await expect(repository.expireVoiceSessionIfStale("user-1", "session-refreshed", now)).resolves.toBe(
      false
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-refreshed",
        initiatorUserId: "user-1",
        status: { in: ["connecting", "active"] },
        OR: [
          { expiresAt: { lte: now } },
          { status: "connecting", startedAt: { lte: new Date("2030-01-01T11:55:00.000Z") } },
          { status: "active", lastHeartbeatAt: { lte: new Date("2030-01-01T11:58:00.000Z") } },
        ],
      },
      data: {
        status: "ended",
        endedAt: now,
        orchestrationPhase: "ended",
        floorOwnerAvatarId: null,
        floorTurnId: null,
        floorLeaseExpiresAt: null,
      },
    });
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("closes the whole group call after atomically claiming an expired session", async () => {
    const voiceSessionUpdate = vi.fn(async () => ({ count: 1 }));
    const participantUpdate = vi.fn(async () => ({ count: 2 }));
    const realtimeUpdate = vi.fn(async () => ({ count: 2 }));
    const conversationUpdate = vi.fn(async () => ({ id: "conversation-1" }));
    const publicSessionUpdate = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      groupVoiceSession: {
        updateMany: voiceSessionUpdate,
        findUniqueOrThrow: vi.fn(async () => ({
          id: "session-expired",
          conversationId: "conversation-1",
          groupPublicSessionId: "public-session-1",
        })),
      },
      groupPlannedTurn: { updateMany: vi.fn(async () => ({ count: 1 })) },
      groupVoiceRound: { updateMany: vi.fn(async () => ({ count: 1 })) },
      groupVoiceParticipant: { updateMany: participantUpdate },
      realtimeSession: { updateMany: realtimeUpdate },
      conversation: { update: conversationUpdate },
      groupPublicSession: { updateMany: publicSessionUpdate },
    };
    const repository = createAvatarGroupRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);
    const now = new Date("2030-01-01T12:00:00.000Z");

    await expect(
      repository.expireVoiceSessionIfStale("group-public:public-session-1", "session-expired", now)
    ).resolves.toBe(true);

    expect(voiceSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupPublicSessionId: "public-session-1" }),
      })
    );
    expect(participantUpdate).toHaveBeenCalledWith({
      where: { groupVoiceSessionId: "session-expired", status: { in: ["connecting", "active"] } },
      data: { status: "ended", endedAt: now },
    });
    expect(realtimeUpdate).toHaveBeenCalledWith({
      where: { groupVoiceParticipant: { groupVoiceSessionId: "session-expired" } },
      data: { status: "ended", endedAt: now },
    });
    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "ended" },
    });
    expect(publicSessionUpdate).toHaveBeenCalledWith({
      where: { id: "public-session-1", status: "active" },
      data: { status: "ended", endedAt: now },
    });
  });

  it("does not expose update or delete flows for messages", () => {
    const messageRepository = createMessageRepository(prisma);

    expect("append" in messageRepository).toBe(true);
    expect("listByConversation" in messageRepository).toBe(true);
    expect("update" in messageRepository).toBe(false);
    expect("delete" in messageRepository).toBe(false);
  });

  it("exposes public user lookup without password hash by contract", () => {
    const userRepository = createUserRepository(prisma);

    expect("findPublicById" in userRepository).toBe(true);
    expect("findByEmail" in userRepository).toBe(true);
  });

  it("claims an expired public session before closing its related records", async () => {
    const order: string[] = [];
    const transaction = {
      publicSession: {
        updateMany: vi.fn(async () => {
          order.push("public-session");
          return { count: 1 };
        }),
      },
      conversation: {
        updateMany: vi.fn(async () => {
          order.push("conversation");
          return { count: 1 };
        }),
      },
      realtimeSession: {
        updateMany: vi.fn(async () => {
          order.push("realtime-session");
          return { count: 1 };
        }),
      },
    };
    const repository = createPublicSessionRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.expireIfActive({
        publicSessionId: "public-session-1",
        conversationId: "conversation-1",
        realtimeSessionId: "realtime-session-1",
      })
    ).resolves.toBe(true);
    expect(order).toEqual(["public-session", "conversation", "realtime-session"]);
  });

  it("stores the access grant directly on realtime sessions for indexed quota lookups", async () => {
    const create = vi.fn(async (_input: unknown) => ({ id: "realtime-1" }));
    const db = {
      realtimeSession: { create },
    } as never;
    const realtimeSessions = createRealtimeSessionRepository(db);

    await realtimeSessions.create({
      avatarAgentId: "avatar-1",
      conversationId: "conversation-1",
      accessGrantId: "grant-1",
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accessGrantId: "grant-1" }),
    });
  });

  it("prepares only a connecting realtime session that has not expired", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const findUnique = vi.fn();
    const transaction = { realtimeSession: { updateMany, findUnique } };
    const repository = createRealtimeSessionRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.markPrepared("realtime-1", "provider-session-1", "encrypted-token")
    ).resolves.toBeNull();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "realtime-1",
        status: "connecting",
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      data: {
        providerSessionId: "provider-session-1",
        providerSessionTokenCiphertext: "encrypted-token",
      },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("records activation only when a prepared session is confirmed", async () => {
    const active = { id: "realtime-1", status: "active", activatedAt: new Date() };
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findUnique = vi.fn(async () => active);
    const transaction = { realtimeSession: { updateMany, findUnique } };
    const repository = createRealtimeSessionRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.markActive("realtime-1")).resolves.toBe(active);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "realtime-1",
        status: "connecting",
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      data: { status: "active", activatedAt: expect.any(Date) },
    });
  });

  it("keeps realtime activation idempotent after the first confirmation", async () => {
    const active = { id: "realtime-1", status: "active", activatedAt: new Date() };
    const transaction = {
      realtimeSession: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => active),
      },
    };
    const repository = createRealtimeSessionRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.markActive("realtime-1")).resolves.toBe(active);
  });

  it("atomically fails only an unconfirmed owner session and closes its conversation", async () => {
    const realtimeUpdate = vi.fn(async () => ({ count: 1 }));
    const conversationUpdate = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      realtimeSession: { updateMany: realtimeUpdate },
      conversation: { updateMany: conversationUpdate },
    };
    const repository = createRealtimeSessionRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.failUnconfirmedOwnerStart("realtime-1", "conversation-1", "Start confirmation timed out")
    ).resolves.toBe(true);

    expect(realtimeUpdate).toHaveBeenCalledWith({
      where: {
        id: "realtime-1",
        conversationId: "conversation-1",
        accessGrantId: null,
        publicSessionId: null,
        groupVoiceParticipant: { is: null },
        status: "connecting",
      },
      data: {
        status: "errored",
        endedAt: expect.any(Date),
        errorMessage: "Start confirmation timed out",
      },
    });
    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1", status: "active" },
      data: { status: "ended" },
    });
  });

  it("leaves a concurrently activated owner session untouched", async () => {
    const realtimeUpdate = vi.fn(async () => ({ count: 0 }));
    const conversationUpdate = vi.fn();
    const transaction = {
      realtimeSession: { updateMany: realtimeUpdate },
      conversation: { updateMany: conversationUpdate },
    };
    const repository = createRealtimeSessionRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.failUnconfirmedOwnerStart("realtime-1", "conversation-1", "Start confirmation timed out")
    ).resolves.toBe(false);
    expect(conversationUpdate).not.toHaveBeenCalled();
  });

  it("keeps public activation idempotent without moving the original activation time", async () => {
    const shareLinkUpdate = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: "public-session-1" }]),
      realtimeSession: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        findFirst: vi.fn(async () => ({ status: "active", activatedAt: new Date() })),
      },
      shareLink: { updateMany: shareLinkUpdate },
    };
    const repository = createPublicSessionRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.markStarted({
        publicSessionId: "public-session-1",
        realtimeSessionId: "realtime-1",
        shareLinkId: "share-link-1",
      })
    ).resolves.toBe(true);
    expect(shareLinkUpdate).not.toHaveBeenCalled();
  });

  it("locks the active avatar before revalidating a shared access grant", async () => {
    const queries: string[] = [];
    const queryRaw = vi.fn(async (query: TemplateStringsArray, ..._values: unknown[]) => {
      queries.push(query.join(" "));
      return queries.length === 1 ? [{ id: "avatar-1" }] : [];
    });
    const conversationCreate = vi.fn();
    const realtimeSessionCreate = vi.fn();
    const transaction = {
      $queryRaw: queryRaw,
      conversation: { create: conversationCreate },
      realtimeSession: {
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
        create: realtimeSessionCreate,
      },
    };
    const repository = createExternalSessionPolicyRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.reserveSharedSession(
        {
          accessGrantId: "grant-1",
          participantUserId: "participant-1",
          avatarAgentId: "avatar-1",
          since: new Date("2026-08-19T12:00:00.000Z"),
        },
        () => new Date("2026-08-20T12:01:00.000Z")
      )
    ).resolves.toBeNull();

    expect(queries[0]).toContain('FROM "AvatarAgent"');
    expect(queries[0]).toContain(`"status" = 'active'`);
    expect(queries[0]).toContain("FOR UPDATE");
    expect(queries[1]).toContain('FROM "AccessGrant" AS access_grant');
    expect(queries[1]).toContain(`access_grant."status" = 'active'`);
    expect(queries[1]).toContain("FOR UPDATE");
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(realtimeSessionCreate).not.toHaveBeenCalled();
  });

  it("locks the active avatar before revalidating a public share link", async () => {
    const queries: string[] = [];
    const queryRaw = vi.fn(async (query: TemplateStringsArray, ..._values: unknown[]) => {
      queries.push(query.join(" "));
      return queries.length === 1 ? [{ id: "avatar-1" }] : [];
    });
    const publicSessionCreate = vi.fn();
    const conversationCreate = vi.fn();
    const realtimeSessionCreate = vi.fn();
    const transaction = {
      $queryRaw: queryRaw,
      publicSession: { findMany: vi.fn(async () => []), create: publicSessionCreate },
      conversation: { create: conversationCreate },
      realtimeSession: {
        count: vi.fn(async () => 0),
        create: realtimeSessionCreate,
      },
    };
    const repository = createExternalSessionPolicyRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.reservePublicSession(
        {
          shareLinkId: "link-1",
          participantEmail: "person@example.com",
          avatarAgentId: "avatar-1",
          consentedAt: new Date("2026-08-19T12:00:00.000Z"),
          since: new Date("2026-08-18T12:00:00.000Z"),
        },
        () => new Date("2026-08-19T12:01:00.000Z")
      )
    ).resolves.toBeNull();

    expect(queries[0]).toContain('FROM "AvatarAgent"');
    expect(queries[0]).toContain(`"status" = 'active'`);
    expect(queries[0]).toContain("FOR UPDATE");
    expect(queries[1]).toContain('FROM "ShareLink" AS share_link');
    expect(queries[1]).toContain(`share_link."isEnabled" = TRUE`);
    expect(queries[1]).toContain("FOR UPDATE");
    expect(publicSessionCreate).not.toHaveBeenCalled();
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(realtimeSessionCreate).not.toHaveBeenCalled();
  });

  it("reserves shared capacity with the grant email across individual and group channels", async () => {
    let queryNumber = 0;
    const queryRaw = vi.fn(async (_query: unknown) => {
      queryNumber += 1;
      if (queryNumber === 1) return [{ id: "avatar-1" }];
      return queryNumber === 2
        ? [
            {
              id: "grant-1",
              participantEmail: "person@example.com",
              maxSessionDurationSeconds: null,
              maxSessionsPer24Hours: null,
            },
          ]
        : [];
    });
    const decideExpiresAt = vi.fn(() => new Date("2026-08-20T12:01:00.000Z"));
    const transaction = {
      $queryRaw: queryRaw,
      conversation: { create: vi.fn(async () => ({ id: "conversation-1" })) },
      realtimeSession: {
        findMany: vi.fn(async () => []),
        count: vi.fn(async (input: { where: { avatarAgentId?: string } }) =>
          input.where.avatarAgentId ? 4 : 2
        ),
        create: vi.fn(async () => ({ id: "realtime-1" })),
      },
      groupVoiceSession: { count: vi.fn(async () => 1) },
      groupVoiceParticipant: { count: vi.fn(async () => 3) },
    };
    const repository = createExternalSessionPolicyRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.reserveSharedSession(
        {
          accessGrantId: "grant-1",
          participantUserId: "participant-1",
          avatarAgentId: "avatar-1",
          since: new Date("2026-08-19T12:00:00.000Z"),
        },
        decideExpiresAt
      )
    ).resolves.toMatchObject({
      conversation: { id: "conversation-1" },
      realtimeSession: { id: "realtime-1" },
    });

    const advisoryLock = queryRaw.mock.calls[2]?.[0] as unknown as { values: unknown[] };
    expect(advisoryLock.values).toEqual(["external-participant:person@example.com"]);
    expect(decideExpiresAt).toHaveBeenCalledWith({
      limits: { maxSessionDurationSeconds: null, maxSessionsPer24Hours: null },
      usage: [],
      participantActive: 3,
      avatarActive: 7,
    });
  });

  it("locks a grant before revoking it so its activation cohort remains durable", async () => {
    const order: string[] = [];
    const transaction = {
      $queryRaw: vi.fn(async (_query: TemplateStringsArray, ..._values: unknown[]) => {
        order.push("lock");
        return [{ id: "grant-1", status: "active", revokedAt: null }];
      }),
      accessGrant: {
        update: vi.fn(async () => {
          order.push("revoke");
          return { id: "grant-1" };
        }),
      },
    };
    const repository = createAccessGrantRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.deleteForAvatar("owner-1", "avatar-1", "grant-1")).resolves.toMatchObject({
      outcome: "revoked",
    });
    expect(order).toEqual(["lock", "revoke"]);
  });

  it("revokes instead of deleting a grant referenced only by a realtime session", async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: "grant-1", status: "active", revokedAt: null }]),
      accessGrant: {
        update: vi.fn(async () => ({ id: "grant-1", status: "revoked" })),
        delete: vi.fn(),
      },
    };
    const repository = createAccessGrantRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.deleteForAvatar("owner-1", "avatar-1", "grant-1")).resolves.toMatchObject({
      outcome: "revoked",
    });
    expect(transaction.accessGrant.delete).not.toHaveBeenCalled();
  });

  it("preserves an unreferenced activation cohort before its seven-day window closes", async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => [
        {
          id: "grant-1",
          status: "active",
          revokedAt: null,
        },
      ]),
      accessGrant: {
        update: vi.fn(async () => ({ id: "grant-1", status: "revoked" })),
        delete: vi.fn(),
      },
    };
    const repository = createAccessGrantRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(repository.deleteForAvatar("owner-1", "avatar-1", "grant-1")).resolves.toMatchObject({
      outcome: "revoked",
    });
    expect(transaction.accessGrant.delete).not.toHaveBeenCalled();
  });

  it("recovers provider cleanup for owner and shared private sessions without claiming public or group calls", async () => {
    const findMany = vi.fn(async () => []);
    const repository = createExternalSessionPolicyRepository({
      realtimeSession: { findMany },
    } as never);
    const now = new Date("2026-08-20T12:00:00.000Z");

    await repository.listPrivateForProviderStop(now);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        providerStoppedAt: null,
        providerSessionTokenCiphertext: { not: null },
        publicSessionId: null,
        groupVoiceParticipant: { is: null },
        OR: [
          { status: { in: ["ended", "errored"] } },
          {
            status: { in: ["connecting", "active"] },
            expiresAt: { lte: now },
            accessGrantId: { not: null },
          },
          {
            status: "connecting",
            accessGrantId: null,
            startedAt: { lte: new Date("2026-08-20T11:55:00.000Z") },
          },
        ],
      },
      orderBy: { id: "asc" },
      take: 50,
      select: {
        id: true,
        status: true,
        conversationId: true,
        expiresAt: true,
        accessGrantId: true,
        providerSessionTokenCiphertext: true,
      },
    });
  });
});
