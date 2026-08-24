import { describe, expect, it, vi } from "vitest";
import {
  ActiveSessionExistsError,
  ExternalSessionCapacityError,
  ShareSessionCountLimitError,
  createExternalSessionPolicyService,
} from "./domains/external-sessions/policy";
import { createInMemoryRateLimiter } from "./domains/public-sessions/rate-limiter";
import {
  createVoiceSessionsService,
  ExternalSessionLifecycleConfigurationError,
} from "./domains/voice-sessions/service";
import type { InteractionLimits } from "@yuni/domain";

const unlimited = {
  maxSessionDurationSeconds: null,
  maxSessionsPer24Hours: null,
};
const now = new Date("2026-08-14T12:00:00.000Z");

function repository(overrides: Record<string, unknown> = {}) {
  return {
    reservePublicSession: vi.fn(async () => null),
    reserveSharedSession: vi.fn(async () => null),
    listSharedForProviderStop: vi.fn(async () => []),
    listExpiredSharedForCleanup: vi.fn(async () => []),
    ...overrides,
  };
}

type ReservationSnapshot = {
  limits: InteractionLimits;
  usage: Array<{ id: string; startedAt: Date; endedAt: Date | null }>;
  participantActive: number;
  avatarActive: number;
};
type DecideExpiresAt = (snapshot: ReservationSnapshot) => Date;
type SharedReservationInput = { since: Date };
type PublicReservationInput = {
  shareLinkId: string;
  participantEmail: string;
};

function sharedInput(targetId = "grant-1") {
  return { targetId, avatarId: "avatar-1", participantUserId: "user-1" };
}

function sharedReservation(expiresAt: Date) {
  return {
    conversation: { id: "conversation-1" },
    realtimeSession: { id: "realtime-1" },
    expiresAt,
  };
}

function publicReservation(expiresAt: Date) {
  return {
    publicSession: { id: "public-1" },
    conversation: { id: "conversation-1" },
    realtimeSession: { id: "realtime-1" },
    expiresAt,
  };
}

function service(repo: ReturnType<typeof repository>, current = now) {
  return createExternalSessionPolicyService({
    repository: repo as never,
    hardMaxMinutes: 60,
    maxConcurrentPerParticipant: 1,
    maxConcurrentPerAvatar: 20,
    now: () => current,
  });
}

describe("external session owner quotas", () => {
  it("applies the technical 60 minute ceiling to an unlimited policy", async () => {
    const reserveSharedSession = vi.fn(async (_input: unknown, decideExpiresAt: DecideExpiresAt) =>
      sharedReservation(
        decideExpiresAt({ limits: unlimited, usage: [], participantActive: 0, avatarActive: 0 })
      )
    );
    const result = await service(repository({ reserveSharedSession })).reserveShared(sharedInput());

    expect(result?.expiresAt.toISOString()).toBe("2026-08-14T13:00:00.000Z");
  });

  it("isolates public quota by normalized link and email", async () => {
    const reservePublicSession = vi.fn(
      async (input: PublicReservationInput, decideExpiresAt: DecideExpiresAt) => {
        const usage =
          input.shareLinkId === "link-1" && input.participantEmail === "used@example.com"
            ? [{ id: "s1", startedAt: new Date("2026-08-14T11:00:00.000Z"), endedAt: now }]
            : [];
        return publicReservation(
          decideExpiresAt({
            limits: { ...unlimited, maxSessionsPer24Hours: 1 },
            usage,
            participantActive: 0,
            avatarActive: 0,
          })
        );
      }
    );
    const repo = repository({ reservePublicSession });
    const policy = service(repo);
    await expect(
      policy.reservePublic({
        targetId: "link-1",
        avatarId: "avatar-1",
        participantEmail: "USED@EXAMPLE.COM",
        consentedAt: now,
      })
    ).rejects.toBeInstanceOf(ShareSessionCountLimitError);
    await expect(
      policy.reservePublic({
        targetId: "link-1",
        avatarId: "avatar-1",
        participantEmail: "other@example.com",
        consentedAt: now,
      })
    ).resolves.toMatchObject({ publicSession: { id: "public-1" } });
  });

  it("releases a rolling session quota at the 24 hour boundary", async () => {
    const startedAt = new Date("2026-08-13T12:00:00.000Z");
    const makeRepository = () => {
      const reserveSharedSession = vi.fn(
        async (input: SharedReservationInput, decideExpiresAt: DecideExpiresAt) => {
          const usage =
            startedAt.getTime() > input.since.getTime() ? [{ id: "s1", startedAt, endedAt: startedAt }] : [];
          return sharedReservation(
            decideExpiresAt({
              limits: { ...unlimited, maxSessionsPer24Hours: 1 },
              usage,
              participantActive: 0,
              avatarActive: 0,
            })
          );
        }
      );
      return repository({ reserveSharedSession });
    };
    await expect(
      service(makeRepository(), new Date(now.getTime() - 1)).reserveShared(sharedInput())
    ).rejects.toBeInstanceOf(ShareSessionCountLimitError);
    await expect(service(makeRepository()).reserveShared(sharedInput())).resolves.toMatchObject({
      realtimeSession: { id: "realtime-1" },
    });
  });

  it("supports call durations expressed in seconds", async () => {
    const reserveSharedSession = vi.fn(async (_input: unknown, decideExpiresAt: DecideExpiresAt) =>
      sharedReservation(
        decideExpiresAt({
          limits: { ...unlimited, maxSessionDurationSeconds: 45 },
          usage: [],
          participantActive: 0,
          avatarActive: 0,
        })
      )
    );
    const result = await service(repository({ reserveSharedSession })).reserveShared(sharedInput());

    expect(result?.expiresAt.toISOString()).toBe("2026-08-14T12:00:45.000Z");
  });

  it("serializes concurrent starts so participant and avatar capacity cannot be crossed", async () => {
    let participantActive = 0;
    let avatarActive = 0;
    let releaseFirst: () => void = () => undefined;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const reserveSharedSession = vi.fn(async (_input: unknown, decideExpiresAt: DecideExpiresAt) => {
      const expiresAt = decideExpiresAt({ limits: unlimited, usage: [], participantActive, avatarActive });
      participantActive += 1;
      avatarActive += 1;
      await firstCanFinish;
      return sharedReservation(expiresAt);
    });
    const repo = repository({ reserveSharedSession });
    const policy = service(repo);
    const first = policy.reserveShared(sharedInput());
    await vi.waitFor(() => expect(participantActive).toBe(1));
    const second = policy.reserveShared(sharedInput());
    releaseFirst();
    await expect(first).resolves.toMatchObject({ realtimeSession: { id: "realtime-1" } });
    await expect(second).rejects.toBeInstanceOf(ActiveSessionExistsError);
  });

  it("releases policy locks after a failed reservation", async () => {
    const reserveSharedSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockImplementationOnce(async (_input: unknown, decideExpiresAt: DecideExpiresAt) =>
        sharedReservation(
          decideExpiresAt({ limits: unlimited, usage: [], participantActive: 0, avatarActive: 0 })
        )
      );
    const policy = service(repository({ reserveSharedSession }));

    await expect(policy.reserveShared(sharedInput())).rejects.toThrow("provider failed");
    await expect(policy.reserveShared(sharedInput())).resolves.toMatchObject({
      realtimeSession: { id: "realtime-1" },
    });
  });

  it("enforces avatar capacity across different grants", async () => {
    const reserveSharedSession = vi.fn(async (_input: unknown, decideExpiresAt: DecideExpiresAt) =>
      sharedReservation(
        decideExpiresAt({ limits: unlimited, usage: [], participantActive: 0, avatarActive: 20 })
      )
    );
    const repo = repository({ reserveSharedSession });
    await expect(service(repo).reserveShared(sharedInput("grant-2"))).rejects.toBeInstanceOf(
      ExternalSessionCapacityError
    );
  });

  it("calculates shared expiry from the grant snapshot locked by the repository", async () => {
    const reserveSharedSession = vi.fn(
      async (
        _input: unknown,
        decideExpiresAt: (snapshot: {
          limits: {
            maxSessionDurationSeconds: number | null;
            maxSessionsPer24Hours: number | null;
          };
          usage: [];
          participantActive: number;
          avatarActive: number;
        }) => Date
      ) => ({
        conversation: { id: "conversation-1" },
        realtimeSession: { id: "realtime-1" },
        expiresAt: decideExpiresAt({
          limits: { ...unlimited, maxSessionDurationSeconds: 30 },
          usage: [],
          participantActive: 0,
          avatarActive: 0,
        }),
      })
    );
    const policy = service(repository({ reserveSharedSession }));

    await expect(
      policy.reserveShared({
        targetId: "grant-1",
        avatarId: "avatar-1",
        participantUserId: "user-1",
      })
    ).resolves.toMatchObject({ expiresAt: new Date("2026-08-14T12:00:30.000Z") });
    expect(reserveSharedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessGrantId: "grant-1",
        participantUserId: "user-1",
        avatarAgentId: "avatar-1",
      }),
      expect.any(Function)
    );
  });

  it("calculates public expiry from the link snapshot locked by the repository", async () => {
    const reservePublicSession = vi.fn(
      async (
        _input: unknown,
        decideExpiresAt: (snapshot: {
          limits: {
            maxSessionDurationSeconds: number | null;
            maxSessionsPer24Hours: number | null;
          };
          usage: [];
          participantActive: number;
          avatarActive: number;
        }) => Date
      ) => ({
        publicSession: { id: "public-1" },
        conversation: { id: "conversation-1" },
        realtimeSession: { id: "realtime-1" },
        expiresAt: decideExpiresAt({
          limits: { ...unlimited, maxSessionDurationSeconds: 45 },
          usage: [],
          participantActive: 0,
          avatarActive: 0,
        }),
      })
    );
    const policy = service(repository({ reservePublicSession }));

    await expect(
      policy.reservePublic({
        targetId: "link-1",
        avatarId: "avatar-1",
        participantEmail: "PERSON@example.com",
        participantUserId: "user-1",
        consentedAt: new Date("2026-08-14T11:59:00.000Z"),
      })
    ).resolves.toMatchObject({ expiresAt: new Date("2026-08-14T12:00:45.000Z") });
    expect(reservePublicSession).toHaveBeenCalledWith(
      expect.objectContaining({
        shareLinkId: "link-1",
        participantEmail: "person@example.com",
        participantUserId: "user-1",
        avatarAgentId: "avatar-1",
      }),
      expect.any(Function)
    );
  });
});

describe("technical sliding window", () => {
  it("evaluates dimensions atomically and releases attempts at the boundary", () => {
    let timestamp = 0;
    const limiter = createInMemoryRateLimiter({ secret: "test-secret", now: () => timestamp });
    const blockedRule = { namespace: "participant", identifiers: ["person"], limit: 1, windowMs: 1000 };
    const untouchedRule = { namespace: "avatar", identifiers: ["avatar-1"], limit: 1, windowMs: 1000 };
    expect(limiter.consume([blockedRule])).toEqual({ allowed: true });
    expect(limiter.consume([blockedRule, untouchedRule])).toMatchObject({ allowed: false });
    expect(limiter.consume([untouchedRule])).toEqual({ allowed: true });
    timestamp = 1000;
    expect(limiter.consume([blockedRule, untouchedRule])).toEqual({ allowed: true });
  });
});

describe("shared external session lifecycle", () => {
  it("persists the shared transcript before stopping the provider", async () => {
    const order: string[] = [];
    const stopSession = vi.fn(async () => {
      order.push("stop");
    });
    const finalizePrivate = vi.fn(async () => {
      order.push("finalize");
      return {
        session: {
          id: "realtime-1",
          conversationId: "conversation-1",
          status: "ended",
          endedAt: now,
        },
        finalized: true,
      };
    });
    const voice = createVoiceSessionsService({
      avatarsRepository: { findByIdForOwner: vi.fn(async () => null) },
      conversationsRepository: { updateTitle: vi.fn(async () => undefined) },
      realtimeSessionsRepository: {
        findPrivateForParticipant: vi.fn(async () => ({
          id: "realtime-1",
          avatarAgentId: "avatar-1",
          conversationId: "conversation-1",
          status: "active",
          endedAt: null,
          providerStoppedAt: null,
          providerSessionTokenCiphertext: "encrypted:provider-token",
        })),
        finalizePrivate,
        markProviderStopped: vi.fn(async () => ({ count: 1 })),
      },
      liveAvatarProvider: { stopSession },
      externalSessions: {
        providerTokenProtector: {
          encrypt: vi.fn((token: string) => token),
          decrypt: vi.fn((token: string) => token.replace("encrypted:", "")),
        },
      },
    } as never);

    await voice.endVoiceSession("user-1", "realtime-1", {
      transcript: [{ role: "user", content: "Conservar antes del stop" }],
    });

    expect(order).toEqual(["finalize", "stop"]);
  });

  it("applies limits to the last usable provider version while context sync continues", async () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const stopSession = vi.fn(async () => undefined);
    const markProviderStopped = vi.fn(async () => ({ count: 1 }));
    const expireSharedIfActive = vi.fn().mockRejectedValueOnce(new Error("temporary database failure"));
    const append = vi.fn(async (_conversationId: string, _entry: unknown) => undefined);
    const markConversationEnded = vi.fn(async (_conversationId: string) => undefined);
    const markRealtimeEnded = vi.fn(async (_realtimeSessionId: string) => ({
      id: "realtime-1",
      conversationId: "conversation-1",
      status: "ended",
      endedAt: now,
    }));
    const markActive = vi.fn(async (id: string) => ({
      id,
      conversationId: "conversation-1",
      providerSessionId: "provider-session-1",
      status: "active",
      endedAt: null,
    }));
    const finalizePrivate = vi.fn(
      async (input: {
        realtimeSessionId: string;
        conversationId: string;
        transcript: Array<{ role: "user" | "assistant"; content: string }>;
      }) => {
        for (const entry of input.transcript) {
          await append(input.conversationId, {
            ...entry,
            metadata: { source: "liveavatar_sdk" },
          });
        }
        await markConversationEnded(input.conversationId);
        return {
          session: await markRealtimeEnded(input.realtimeSessionId),
          finalized: true,
        };
      }
    );
    const expiresAt = new Date("2026-08-14T12:10:00.000Z");
    const policyRepository = repository();
    const reserveShared = vi.fn(async () => ({
      conversation: { id: "conversation-1" },
      realtimeSession: { id: "realtime-1" },
      expiresAt,
    }));
    const dependencies = {
      avatarsRepository: {
        findAccessibleForUser: vi.fn(async () => ({
          type: "shared" as const,
          avatar: {
            id: "avatar-1",
            ownerId: "owner-1",
            name: "Tutor",
            description: "",
            instructions: "",
            context: "",
            voiceConfig: { provider: "elevenlabs", voiceId: "voice-1", speakingRate: 1 },
            liveAvatarConfig: {
              provider: "liveavatar",
              avatarId: "live-avatar-1",
              mode: "lite",
              sandbox: true,
            },
            agentProvider: "elevenlabs_agents" as const,
            providerAgentId: "agent-1",
            providerSyncStatus: "syncing" as const,
            providerSyncError: null,
            providerSyncedAt: now,
            providerSyncFingerprint: "fingerprint",
            providerLastUsableAt: now,
            status: "active" as const,
            createdAt: now,
            updatedAt: now,
          },
          accessGrant: {
            id: "grant-1",
            participantEmail: "person@example.com",
            participantUserId: "user-1",
            status: "active" as const,
            maxSessionDurationSeconds: 600,
            maxSessionsPer24Hours: null,
          },
        })),
        findByIdForOwner: vi.fn(async () => null),
        updateProviderSync: vi.fn(),
      },
      conversationsRepository: {
        createPrivateForParticipant: vi.fn(async () => ({ id: "conversation-1" })),
        markEnded: markConversationEnded,
        updateTitle: vi.fn(async () => undefined),
      },
      realtimeSessionsRepository: {
        create: vi.fn(async () => ({ id: "realtime-1" })),
        findPrivateForParticipant: vi.fn(async () => ({
          id: "realtime-1",
          avatarAgentId: "avatar-1",
          conversationId: "conversation-1",
          status: "active",
          endedAt: null,
          providerStoppedAt: now,
          providerSessionTokenCiphertext: null,
        })),
        markActive,
        markEnded: markRealtimeEnded,
        finalizePrivate,
        markErrored: vi.fn(),
        markProviderStopped,
        expireSharedIfActive,
      },
      liveAvatarProvider: {
        createLiteSessionToken: vi.fn(async () => ({
          sessionToken: "provider-token",
          sessionId: "provider-session-1",
        })),
        stopSession,
      },
      elevenLabsAgentProvider: { syncAvatarAgent: vi.fn() },
      externalSessions: {
        policyService: {
          reserveShared,
        },
        policyRepository,
        rateLimiter: { consume: vi.fn(() => ({ allowed: true as const })) },
        providerTokenProtector: {
          encrypt: vi.fn((token: string) => `encrypted:${token}`),
          decrypt: vi.fn((token: string) => token.replace("encrypted:", "")),
        },
        rateLimits: { startIpTarget: 60, startParticipantTarget: 20, startAvatar: 200 },
        schedule: vi.fn((callback: () => void, delayMs: number) => scheduled.push({ callback, delayMs })),
      },
    };
    const voice = createVoiceSessionsService(dependencies as never);
    const started = await voice.startVoiceSession("user-1", "avatar-1", "203.0.113.10");

    expect(started).toEqual({
      conversationId: "conversation-1",
      realtimeSessionId: "realtime-1",
      sessionToken: "provider-token",
      expiresAt: expiresAt.toISOString(),
    });
    expect(markActive).toHaveBeenCalledWith("realtime-1", "provider-session-1", "encrypted:provider-token");
    expect(reserveShared).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "grant-1",
        participantUserId: "user-1",
      })
    );
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.callback();
    await vi.waitFor(() => expect(stopSession).toHaveBeenCalledWith("provider-token"));
    await vi.waitFor(() => expect(markProviderStopped).toHaveBeenCalledWith("realtime-1"));
    expect(expireSharedIfActive).not.toHaveBeenCalled();
    expect(scheduled[1]?.delayMs).toBe(30_000);

    await voice.endVoiceSession("user-1", "realtime-1", {
      transcript: [{ role: "user", content: "Mensaje enviado durante la gracia" }],
    });
    expect(append).toHaveBeenCalledWith("conversation-1", {
      role: "user",
      content: "Mensaje enviado durante la gracia",
      metadata: { source: "liveavatar_sdk" },
    });
    expect(markConversationEnded).toHaveBeenCalledWith("conversation-1");
    expect(markRealtimeEnded).toHaveBeenCalledWith("realtime-1");

    scheduled[1]?.callback();
    await vi.waitFor(() => expect(expireSharedIfActive).toHaveBeenCalledWith("realtime-1", "conversation-1"));
  });

  it("keeps the shared provider token recoverable when activation and immediate stop both fail", async () => {
    const markErrored = vi.fn(async () => undefined);
    const stopSession = vi.fn().mockRejectedValue(new Error("temporary provider failure"));
    const voice = createVoiceSessionsService({
      avatarsRepository: {
        findAccessibleForUser: vi.fn(async () => ({
          type: "shared" as const,
          avatar: {
            id: "avatar-1",
            ownerId: "owner-1",
            name: "Tutor",
            description: "",
            instructions: "",
            context: "",
            voiceConfig: { provider: "elevenlabs", voiceId: "voice-1", speakingRate: 1 },
            liveAvatarConfig: {
              provider: "liveavatar",
              avatarId: "live-avatar-1",
              mode: "lite",
              sandbox: true,
            },
            agentProvider: "elevenlabs_agents" as const,
            providerAgentId: "agent-1",
            providerSyncStatus: "synced" as const,
            providerSyncError: null,
            providerSyncedAt: now,
            providerSyncFingerprint: "fingerprint",
            providerLastUsableAt: now,
            status: "active" as const,
            createdAt: now,
            updatedAt: now,
          },
          accessGrant: {
            id: "grant-1",
            participantEmail: "person@example.com",
            participantUserId: "user-1",
            status: "active" as const,
            maxSessionDurationSeconds: null,
            maxSessionsPer24Hours: null,
          },
        })),
      },
      conversationsRepository: {
        markEnded: vi.fn(async () => undefined),
      },
      realtimeSessionsRepository: {
        markActive: vi.fn().mockRejectedValue(new Error("temporary activation failure")),
        markErrored,
        markProviderStopped: vi.fn(async () => ({ count: 0 })),
        expireSharedIfActive: vi.fn(async () => true),
      },
      liveAvatarProvider: {
        createLiteSessionToken: vi.fn(async () => ({
          sessionToken: "provider-token",
          sessionId: "provider-session-1",
        })),
        stopSession,
      },
      elevenLabsAgentProvider: {},
      externalSessions: {
        policyService: {
          reserveShared: vi.fn(async () => ({
            conversation: { id: "conversation-1" },
            realtimeSession: { id: "realtime-1" },
            expiresAt: new Date("2026-08-14T12:10:00.000Z"),
          })),
        },
        policyRepository: {},
        rateLimiter: { consume: vi.fn(() => ({ allowed: true as const })) },
        providerTokenProtector: {
          encrypt: vi.fn((token: string) => `encrypted:${token}`),
          decrypt: vi.fn((token: string) => token),
        },
        rateLimits: { startIpTarget: 60, startParticipantTarget: 20, startAvatar: 200 },
      },
    } as never);

    await expect(voice.startVoiceSession("user-1", "avatar-1", "203.0.113.10")).rejects.toThrow(
      "temporary activation failure"
    );
    expect(stopSession).toHaveBeenCalledWith("provider-token");
    expect(markErrored).toHaveBeenCalledWith(
      "realtime-1",
      "External voice session start failed",
      "encrypted:provider-token"
    );
  });

  it("does not return a provider token when the shared reservation expires before activation", async () => {
    const markErrored = vi.fn(async () => undefined);
    const stopSession = vi.fn(async () => undefined);
    const voice = createVoiceSessionsService({
      avatarsRepository: {
        findAccessibleForUser: vi.fn(async () => ({
          type: "shared" as const,
          avatar: {
            id: "avatar-1",
            liveAvatarConfig: {
              provider: "liveavatar",
              avatarId: "live-avatar-1",
              mode: "lite",
              sandbox: true,
            },
            voiceConfig: { provider: "elevenlabs", voiceId: "voice-1", speakingRate: 1 },
            providerAgentId: "agent-1",
            providerSyncStatus: "synced" as const,
            providerLastUsableAt: now,
            status: "active" as const,
          },
          accessGrant: {
            id: "grant-1",
            participantEmail: "person@example.com",
            maxSessionDurationSeconds: 10,
            maxSessionsPer24Hours: null,
          },
        })),
      },
      conversationsRepository: { markEnded: vi.fn(async () => undefined) },
      realtimeSessionsRepository: {
        markActive: vi.fn(async () => null),
        markErrored,
        markProviderStopped: vi.fn(async () => ({ count: 1 })),
        expireSharedIfActive: vi.fn(async () => true),
      },
      liveAvatarProvider: {
        createLiteSessionToken: vi.fn(async () => ({
          sessionToken: "provider-token",
          sessionId: "provider-session-1",
        })),
        stopSession,
      },
      elevenLabsAgentProvider: {},
      externalSessions: {
        policyService: {
          reserveShared: vi.fn(async () => ({
            conversation: { id: "conversation-1" },
            realtimeSession: { id: "realtime-1" },
            expiresAt: now,
          })),
        },
        policyRepository: {},
        rateLimiter: { consume: vi.fn(() => ({ allowed: true as const })) },
        providerTokenProtector: {
          encrypt: vi.fn((token: string) => `encrypted:${token}`),
          decrypt: vi.fn((token: string) => token),
        },
        rateLimits: { startIpTarget: 60, startParticipantTarget: 20, startAvatar: 200 },
      },
    } as never);

    await expect(voice.startVoiceSession("user-1", "avatar-1", "203.0.113.10")).rejects.toThrow(
      "Live Avatar session timed out"
    );
    expect(stopSession).toHaveBeenCalledWith("provider-token");
    expect(markErrored).toHaveBeenCalledWith("realtime-1", "External voice session start failed", undefined);
  });

  it("recovers provider stop and expiration independently after an API restart", async () => {
    const stopSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockResolvedValue(undefined);
    const markProviderStopped = vi.fn(async () => ({ count: 1 }));
    const expireSharedIfActive = vi.fn(async () => true);
    const policyRepository = repository({
      listSharedForProviderStop: vi.fn(async () => [
        {
          id: "realtime-1",
          status: "active",
          conversationId: "conversation-1",
          expiresAt: now,
          providerSessionTokenCiphertext: "encrypted:provider-token",
        },
      ]),
      listExpiredSharedForCleanup: vi.fn(async () => [
        { id: "realtime-1", conversationId: "conversation-1" },
      ]),
    });
    const voice = createVoiceSessionsService({
      externalSessions: {
        policyRepository,
        providerTokenProtector: {
          encrypt: vi.fn((token: string) => token),
          decrypt: vi.fn((token: string) => token.replace("encrypted:", "")),
        },
      },
      liveAvatarProvider: { stopSession },
      realtimeSessionsRepository: {
        markProviderStopped,
        expireSharedIfActive,
      },
    } as never);

    await expect(voice.cleanupExpiredShared(now)).resolves.toBe(1);
    await vi.waitFor(() => expect(stopSession).toHaveBeenCalledWith("provider-token"));
    expect(markProviderStopped).not.toHaveBeenCalled();
    expect(policyRepository.listExpiredSharedForCleanup).toHaveBeenCalledWith(
      new Date(now.getTime() - 30_000),
      50
    );
    expect(expireSharedIfActive).toHaveBeenCalledWith("realtime-1", "conversation-1");

    await expect(voice.cleanupExpiredShared(now)).resolves.toBe(1);
    await vi.waitFor(() => expect(stopSession).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(markProviderStopped).toHaveBeenCalledWith("realtime-1"));
  });

  it("closes expired records without waiting for a slow provider stop", async () => {
    let releaseStop: () => void = () => undefined;
    const stopCanFinish = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const expireSharedIfActive = vi.fn(async () => true);
    const policyRepository = repository({
      listSharedForProviderStop: vi.fn(async () => [
        {
          id: "realtime-1",
          status: "active",
          conversationId: "conversation-1",
          expiresAt: now,
          providerSessionTokenCiphertext: "encrypted:provider-token",
        },
      ]),
      listExpiredSharedForCleanup: vi.fn(async () => [
        { id: "realtime-1", conversationId: "conversation-1" },
      ]),
    });
    const voice = createVoiceSessionsService({
      externalSessions: {
        policyRepository,
        providerTokenProtector: {
          encrypt: vi.fn((token: string) => token),
          decrypt: vi.fn((token: string) => token.replace("encrypted:", "")),
        },
      },
      liveAvatarProvider: { stopSession: vi.fn(() => stopCanFinish) },
      realtimeSessionsRepository: {
        markProviderStopped: vi.fn(async () => ({ count: 1 })),
        expireSharedIfActive,
      },
    } as never);

    const cleanup = voice.cleanupExpiredShared(now);
    await vi.waitFor(() => expect(expireSharedIfActive).toHaveBeenCalledWith("realtime-1", "conversation-1"));
    await expect(cleanup).resolves.toBe(1);
    await expect(voice.cleanupExpiredShared(now)).resolves.toBe(1);
    releaseStop();
  });

  it("fails closed when provider stop is unavailable", async () => {
    const expireSharedIfActive = vi.fn(async () => true);
    const policyRepository = repository({
      listExpiredSharedForCleanup: vi.fn(async () => [
        { id: "realtime-1", conversationId: "conversation-1" },
      ]),
    });
    const voice = createVoiceSessionsService({
      externalSessions: { policyRepository },
      liveAvatarProvider: {},
      realtimeSessionsRepository: { expireSharedIfActive },
    } as never);

    await expect(voice.cleanupExpiredShared(now)).rejects.toBeInstanceOf(
      ExternalSessionLifecycleConfigurationError
    );
    expect(expireSharedIfActive).not.toHaveBeenCalled();
    expect(policyRepository.listSharedForProviderStop).not.toHaveBeenCalled();
  });

  it("closes an expired shared realtime session even when its conversation was deleted", async () => {
    const expireSharedIfActive = vi.fn(async () => true);
    const policyRepository = repository({
      listExpiredSharedForCleanup: vi.fn(async () => [{ id: "realtime-1", conversationId: null }]),
    });
    const voice = createVoiceSessionsService({
      externalSessions: { policyRepository },
      liveAvatarProvider: { stopSession: vi.fn(async () => undefined) },
      realtimeSessionsRepository: {
        markProviderStopped: vi.fn(async () => ({ count: 1 })),
        expireSharedIfActive,
      },
    } as never);

    await expect(voice.cleanupExpiredShared(now)).resolves.toBe(1);
    expect(expireSharedIfActive).toHaveBeenCalledWith("realtime-1", null);
  });

  it("counts only shared sessions that maintenance actually closes", async () => {
    const expireSharedIfActive = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce(true);
    const policyRepository = repository({
      listExpiredSharedForCleanup: vi.fn(async () => [
        { id: "realtime-1", conversationId: "conversation-1" },
      ]),
    });
    const voice = createVoiceSessionsService({
      externalSessions: { policyRepository },
      liveAvatarProvider: { stopSession: vi.fn(async () => undefined) },
      realtimeSessionsRepository: {
        markProviderStopped: vi.fn(async () => ({ count: 1 })),
        expireSharedIfActive,
      },
    } as never);

    await expect(voice.cleanupExpiredShared(now)).resolves.toBe(0);
    await expect(voice.cleanupExpiredShared(now)).resolves.toBe(1);
  });

  it("advances past provider stops that keep failing", async () => {
    const sessions = {
      first: {
        id: "realtime-1",
        status: "ended",
        conversationId: "conversation-1",
        expiresAt: now,
        providerSessionTokenCiphertext: "encrypted:provider-token-1",
      },
      second: {
        id: "realtime-2",
        status: "ended",
        conversationId: "conversation-2",
        expiresAt: now,
        providerSessionTokenCiphertext: "encrypted:provider-token-2",
      },
    };
    const listSharedForProviderStop = vi.fn(async (_now: Date, _limit: number, afterId?: string) =>
      afterId === "realtime-1" ? [sessions.second] : [sessions.first]
    );
    const stopSession = vi.fn().mockRejectedValue(new Error("permanent provider failure"));
    const voice = createVoiceSessionsService({
      externalSessions: {
        policyRepository: repository({ listSharedForProviderStop }),
        providerTokenProtector: {
          encrypt: vi.fn((token: string) => token),
          decrypt: vi.fn((token: string) => token.replace("encrypted:", "")),
        },
      },
      liveAvatarProvider: { stopSession },
      realtimeSessionsRepository: {
        markProviderStopped: vi.fn(async () => ({ count: 1 })),
        expireSharedIfActive: vi.fn(async () => true),
      },
    } as never);

    await voice.cleanupExpiredShared(now);
    await vi.waitFor(() => expect(stopSession).toHaveBeenCalledTimes(1));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await voice.cleanupExpiredShared(now);
    await vi.waitFor(() => expect(stopSession).toHaveBeenCalledTimes(2));

    expect(listSharedForProviderStop).toHaveBeenNthCalledWith(2, now, 50, "realtime-1");
    expect(stopSession).toHaveBeenNthCalledWith(1, "provider-token-1");
    expect(stopSession).toHaveBeenNthCalledWith(2, "provider-token-2");
  });
});
