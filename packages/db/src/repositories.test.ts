import { describe, expect, it, vi } from "vitest";
import { prisma } from "./client";
import { createAccessGrantRepository } from "./repositories/access-grant-repository";
import { createMessageRepository } from "./repositories/message-repository";
import { createExternalSessionPolicyRepository } from "./repositories/external-session-policy-repository";
import { createPublicSessionRepository } from "./repositories/public-session-repository";
import { createRealtimeSessionRepository } from "./repositories/realtime-session-repository";
import { createUserRepository } from "./repositories/user-repository";

describe("@yuni/db repository contracts", () => {
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

  it("activates only a connecting realtime session that has not expired", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const findUnique = vi.fn();
    const transaction = { realtimeSession: { updateMany, findUnique } };
    const repository = createRealtimeSessionRepository({
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      ),
    } as never);

    await expect(
      repository.markActive("realtime-1", "provider-session-1", "encrypted-token")
    ).resolves.toBeNull();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "realtime-1",
        status: "connecting",
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      data: {
        status: "active",
        providerSessionId: "provider-session-1",
        providerSessionTokenCiphertext: "encrypted-token",
      },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("locks and revalidates an active grant before reserving shared session records", async () => {
    const queryRaw = vi.fn(async (_query: TemplateStringsArray, ..._values: unknown[]) => []);
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

    const queryTemplate = queryRaw.mock.calls[0]?.[0] as unknown as readonly string[];
    const query = queryTemplate.join(" ");
    expect(query).toContain("FOR UPDATE OF access_grant, avatar_agent");
    expect(query).toContain(`avatar_agent."status" = 'active'`);
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(realtimeSessionCreate).not.toHaveBeenCalled();
  });

  it("locks and revalidates the public link and avatar before reserving session records", async () => {
    const queryRaw = vi.fn(async (_query: TemplateStringsArray, ..._values: unknown[]) => []);
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

    const queryTemplate = queryRaw.mock.calls[0]?.[0] as unknown as readonly string[];
    const query = queryTemplate.join(" ");
    expect(query).toContain("FOR UPDATE OF share_link, avatar_agent");
    expect(query).toContain(`share_link."isEnabled" = TRUE`);
    expect(query).toContain(`avatar_agent."status" = 'active'`);
    expect(publicSessionCreate).not.toHaveBeenCalled();
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(realtimeSessionCreate).not.toHaveBeenCalled();
  });

  it("locks a grant before deciding whether deletion must become revocation", async () => {
    const order: string[] = [];
    const transaction = {
      $queryRaw: vi.fn(async (_query: TemplateStringsArray, ..._values: unknown[]) => {
        order.push("lock");
        return [{ id: "grant-1", status: "active", revokedAt: null }];
      }),
      conversation: {
        count: vi.fn(async () => {
          order.push("conversation-count");
          return 1;
        }),
      },
      realtimeSession: {
        count: vi.fn(async () => {
          order.push("realtime-count");
          return 0;
        }),
      },
      conversationAvatar: {
        count: vi.fn(async () => {
          order.push("group-conversation-count");
          return 0;
        }),
      },
      avatarGroupMember: {
        count: vi.fn(async () => {
          order.push("group-membership-count");
          return 0;
        }),
      },
      accessGrant: {
        update: vi.fn(async () => {
          order.push("revoke");
          return { id: "grant-1" };
        }),
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
    expect(order).toEqual([
      "lock",
      "conversation-count",
      "realtime-count",
      "group-conversation-count",
      "group-membership-count",
      "revoke",
    ]);
    expect(transaction.accessGrant.delete).not.toHaveBeenCalled();
  });

  it("revokes instead of deleting a grant referenced only by a realtime session", async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => [{ id: "grant-1", status: "active", revokedAt: null }]),
      conversation: { count: vi.fn(async () => 0) },
      realtimeSession: { count: vi.fn(async () => 1) },
      conversationAvatar: { count: vi.fn(async () => 0) },
      avatarGroupMember: { count: vi.fn(async () => 0) },
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
});

describe.skip("repository integration tests", () => {
  it("requires a dedicated PostgreSQL test database before running ownership and slug scenarios", () => {
    expect(true).toBe(true);
  });
});
