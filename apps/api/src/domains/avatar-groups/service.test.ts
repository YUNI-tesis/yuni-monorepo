import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createAvatarGroupsController } from "./controller";
import { createCreatorSessionMiddleware, type CreatorSessionEnv } from "../auth/middleware";
import { createSessionToken, SESSION_COOKIE_NAME } from "../auth/session";
import { createAvatarGroupsService, type AvatarGroupsServiceDependencies } from "./service";

function avatar(id: string) {
  return {
    id,
    ownerId: "user-1",
    name: `Avatar ${id}`,
    description: "Especialista",
    instructions: "Respondé breve.",
    context: "Contexto",
    voiceConfig: { provider: "elevenlabs", voiceId: `voice-${id}`, speakingRate: 1 },
    liveAvatarConfig: { provider: "liveavatar", avatarId: `live-${id}`, mode: "lite", sandbox: true },
    groupProviderAgentId: null,
    groupProviderSyncFingerprint: null,
    groupProviderSyncStatus: "not_synced",
    groupProviderSyncRevision: null,
    avatarGroupMembers: [],
    providerContextDocumentId: null,
    providerContextSyncStatus: "pending",
    status: "active",
    documents: [],
  };
}

function queuedDirectiveState(avatarId: string, turnId = `turn-${avatarId}`) {
  const lease = new Date("2030-01-01T00:01:15.000Z");
  return {
    session: {
      orchestrationPhase: "queued",
      floorOwnerAvatarId: avatarId,
      floorTurnId: turnId,
      floorLeaseExpiresAt: lease,
    },
    turn: {
      id: turnId,
      avatarAgentId: avatarId,
      instructionText: `Respondé como ${avatarId}.`,
      status: "claimed",
      avatarAgent: { name: `Avatar ${avatarId}` },
    },
  };
}

function listeningDirectiveState() {
  return {
    session: {
      orchestrationPhase: "listening",
      floorOwnerAvatarId: null,
      floorTurnId: null,
      floorLeaseExpiresAt: null,
    },
    turn: null,
  };
}

describe("avatar group voice service", () => {
  it("does not expose non-HTTP thumbnail URLs in group DTOs", async () => {
    const unsafeAvatar = {
      ...avatar("unsafe-thumbnail"),
      liveAvatarConfig: {
        provider: "liveavatar",
        avatarId: "live-unsafe-thumbnail",
        mode: "lite",
        sandbox: true,
        thumbnailUrl: "ftp://files.example.test/avatar.png",
      },
    };
    const dependencies = {
      repository: {
        listOwned: vi.fn().mockResolvedValue([
          {
            id: "group-1",
            ownerId: "user-1",
            name: "Grupo",
            membershipVersion: 1,
            createdAt: new Date("2030-01-01T00:00:00.000Z"),
            updatedAt: new Date("2030-01-01T00:00:00.000Z"),
            members: [{ position: 0, avatarAgent: unsafeAvatar, accessGrant: null }],
          },
        ]),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    const [group] = await createAvatarGroupsService(dependencies).list("user-1");

    expect(group?.members[0]?.thumbnailUrl).toBeNull();
  });

  it("advertises independently enabled sharing channels and disables sharing when both are off", async () => {
    const groupRecord = {
      id: "group-1",
      ownerId: "user-1",
      name: "Grupo",
      membershipVersion: 1,
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
      updatedAt: new Date("2030-01-01T00:00:00.000Z"),
      members: ["one", "two"].map((id, position) => ({
        position,
        accessGrantId: null,
        avatarAgent: avatar(id),
        accessGrant: null,
      })),
    };
    const repository = { listOwned: vi.fn().mockResolvedValue([groupRecord]) };

    const [publicOnly] = await createAvatarGroupsService({
      repository,
      accountSharingEnabled: () => false,
      publicSharingEnabled: () => true,
    } as unknown as AvatarGroupsServiceDependencies).list("user-1");
    const [disabled] = await createAvatarGroupsService({
      repository,
      accountSharingEnabled: () => false,
      publicSharingEnabled: () => false,
      groupActivityEnabled: () => false,
    } as unknown as AvatarGroupsServiceDependencies).list("user-1");

    expect(publicOnly).toMatchObject({
      sharingChannels: { account: false, public: true },
      access: { canShare: true },
    });
    expect(disabled).toMatchObject({
      sharingChannels: { account: false, public: false },
      activityEnabled: false,
      access: { canShare: false },
    });
  });

  it("marks a disabled group member unavailable even when the user owns it", async () => {
    const disabled = { ...avatar("disabled"), status: "disabled" };
    const dependencies = {
      repository: {
        listOwned: vi.fn().mockResolvedValue([
          {
            id: "group-1",
            ownerId: "user-1",
            name: "Grupo",
            createdAt: new Date("2030-01-01T00:00:00.000Z"),
            updatedAt: new Date("2030-01-01T00:00:00.000Z"),
            members: [{ position: 0, avatarAgent: disabled, accessGrant: null }],
          },
        ]),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    const [group] = await createAvatarGroupsService(dependencies).list("user-1");

    expect(group?.members[0]).toMatchObject({ id: "disabled", available: false });
  });

  it("returns the immutable group name snapshot in conversation history", async () => {
    const dependencies = {
      repository: {
        findConversationForCreator: vi.fn().mockResolvedValue({
          id: "conversation-1",
          title: "Charla histórica",
          avatarGroupId: "group-1",
          avatarGroupNameSnapshot: "Nombre al momento de la llamada",
          avatarGroup: { id: "group-1", name: "Nombre actual" },
          groupParticipantSnapshots: [],
          conversationAvatars: [],
          messages: [],
        }),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).getConversation("user-1", "conversation-1")
    ).resolves.toMatchObject({
      group: { id: "group-1", name: "Nombre al momento de la llamada" },
    });
  });

  it("keeps an owner group reserved while the client confirms the connected participants", async () => {
    const participants = ["one", "two", "three"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      realtimeSessionId: null,
      status: "connecting",
      avatarAgent: avatar(id),
      realtimeSession: null,
    }));
    const repository = {
      findAccessible: vi.fn().mockResolvedValue({
        id: "group-1",
        ownerId: "user-1",
      }),
      createVoiceSession: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      }),
      findVoiceSessionForOwner: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        status: "connecting",
        activatedAt: null,
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
        participants,
      }),
      createRealtimeParticipant: vi
        .fn()
        .mockImplementation((participantId: string) =>
          Promise.resolve({ realtimeSessionId: `realtime-${participantId}` })
        ),
      updateGroupProvider: vi.fn().mockResolvedValue({}),
      activateParticipantConnection: vi.fn().mockResolvedValue(true),
      abandonParticipantConnection: vi.fn().mockResolvedValue(undefined),
      markParticipantErrored: vi.fn().mockResolvedValue({}),
      endSession: vi.fn().mockResolvedValue({}),
    };
    const liveAvatarProvider = {
      createLiteSessionToken: vi.fn().mockImplementation(({ avatarId }: { avatarId: string }) => {
        if (avatarId === "live-three") throw new Error("Provider unavailable");
        return Promise.resolve({ sessionToken: "token-one", sessionId: "live-session-one" });
      }),
      stopSession: vi.fn(),
    };
    const dependencies = {
      repository,
      messagesRepository: {},
      liveAvatarProvider,
      elevenLabsAgentProvider: {
        syncAvatarAgent: vi.fn().mockImplementation(({ id }: { id: string }) =>
          Promise.resolve({
            providerAgentId: `agent-${id}`,
            providerSyncFingerprint: `fingerprint-${id}`,
            synced: true,
          })
        ),
      },
      director: { decide: vi.fn() },
      providerTokenProtector: { encrypt: (token: string) => `encrypted:${token}`, decrypt: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).start("user-1", "group-1");

    expect(result.status).toBe("connecting");
    expect(result.participants.map((participant) => participant.status)).toEqual([
      "active",
      "active",
      "errored",
    ]);
    expect(repository.endSession).not.toHaveBeenCalled();
  });

  it("does not overwrite a provider projection managed by an active sharing channel", async () => {
    const participants = ["one", "two"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      realtimeSessionId: null,
      status: "connecting",
      avatarAgent: {
        ...avatar(id),
        groupProviderAgentId: `agent-${id}`,
        groupProviderSyncFingerprint: `fingerprint-${id}`,
        groupProviderSyncStatus: "synced",
        groupProviderSyncRevision: `shared-revision-${id}`,
        avatarGroupMembers: [{ id: `membership-${id}` }],
      },
      realtimeSession: null,
    }));
    const repository = {
      findAccessible: vi.fn().mockResolvedValue({ id: "group-1", ownerId: "user-1" }),
      createVoiceSession: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      }),
      findVoiceSessionForOwner: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        status: "connecting",
        activatedAt: null,
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
        participants,
      }),
      createRealtimeParticipant: vi
        .fn()
        .mockImplementation((participantId: string) =>
          Promise.resolve({ realtimeSessionId: `realtime-${participantId}` })
        ),
      updateGroupProvider: vi.fn().mockResolvedValue(true),
      activateParticipantConnection: vi.fn().mockResolvedValue(true),
      abandonParticipantConnection: vi.fn().mockResolvedValue(undefined),
      markParticipantErrored: vi.fn().mockResolvedValue(true),
      endSession: vi.fn().mockResolvedValue({}),
    };
    const syncAvatarAgent = vi.fn();
    const dependencies = {
      repository,
      messagesRepository: {},
      liveAvatarProvider: {
        createLiteSessionToken: vi.fn().mockResolvedValue({
          sessionToken: "provider-token",
          sessionId: "provider-session",
        }),
        stopSession: vi.fn(),
      },
      elevenLabsAgentProvider: { syncAvatarAgent },
      providerTokenProtector: { encrypt: (token: string) => `encrypted:${token}`, decrypt: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).start("user-1", "group-1");

    expect(result.participants.every((participant) => participant.status === "active")).toBe(true);
    expect(syncAvatarAgent).not.toHaveBeenCalled();
    expect(repository.updateGroupProvider).not.toHaveBeenCalled();
  });

  it("aborts an owner start when an inline provider revision is superseded", async () => {
    const participants = ["one", "two"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      realtimeSessionId: null,
      status: "connecting",
      avatarAgent: avatar(id),
      realtimeSession: null,
    }));
    const repository = {
      findAccessible: vi.fn().mockResolvedValue({ id: "group-1", ownerId: "user-1" }),
      createVoiceSession: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      }),
      findVoiceSessionForOwner: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        status: "connecting",
        activatedAt: null,
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
        participants,
      }),
      createRealtimeParticipant: vi
        .fn()
        .mockImplementation((participantId: string) =>
          Promise.resolve({ realtimeSessionId: `realtime-${participantId}` })
        ),
      updateGroupProvider: vi
        .fn()
        .mockImplementation((avatarId: string, input: { status: string }) =>
          Promise.resolve(!(avatarId === "one" && input.status === "synced"))
        ),
      activateParticipantConnection: vi.fn().mockResolvedValue(true),
      abandonParticipantConnection: vi.fn().mockResolvedValue(undefined),
      markParticipantErrored: vi.fn().mockResolvedValue(true),
      endSession: vi.fn().mockResolvedValue({}),
    };
    const liveAvatarProvider = {
      createLiteSessionToken: vi.fn().mockResolvedValue({
        sessionToken: "provider-token",
        sessionId: "provider-session",
      }),
      stopSession: vi.fn(),
    };
    const dependencies = {
      repository,
      messagesRepository: {},
      liveAvatarProvider,
      elevenLabsAgentProvider: {
        syncAvatarAgent: vi.fn().mockImplementation(({ id }: { id: string }) =>
          Promise.resolve({
            providerAgentId: `agent-${id}`,
            providerSyncFingerprint: `fingerprint-${id}`,
            synced: true,
          })
        ),
      },
      providerTokenProtector: { encrypt: (token: string) => `encrypted:${token}`, decrypt: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(createAvatarGroupsService(dependencies).start("user-1", "group-1")).rejects.toThrow(
      "al menos dos participantes"
    );

    expect(repository.endSession).toHaveBeenCalledWith("user-1", "group-session-1", "errored");
    expect(repository.activateParticipantConnection).toHaveBeenCalledTimes(1);
  });

  it("aborts a shared start before activation when any roster member fails", async () => {
    const participants = ["one", "two"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      realtimeSessionId: null,
      status: "connecting",
      avatarAgent: {
        ...avatar(id),
        groupProviderAgentId: `agent-${id}`,
        groupProviderSyncFingerprint: `fingerprint-${id}`,
        groupProviderSyncStatus: "synced",
      },
      realtimeSession: null,
    }));
    const repository = {
      findAccessible: vi.fn().mockResolvedValue({ id: "group-1", ownerId: "owner-1" }),
      createSharedVoiceSession: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      }),
      findVoiceSessionForOwner: vi.fn().mockResolvedValue({
        id: "group-session-1",
        avatarGroupId: "group-1",
        conversationId: "conversation-1",
        status: "connecting",
        activatedAt: null,
        groupAccessGrantId: "grant-1",
        groupPublicSessionId: null,
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
        participants,
      }),
      createRealtimeParticipant: vi
        .fn()
        .mockImplementation((participantId: string) =>
          Promise.resolve({ realtimeSessionId: `realtime-${participantId}` })
        ),
      activateParticipantConnection: vi.fn().mockResolvedValue(true),
      abandonParticipantConnection: vi.fn().mockResolvedValue(undefined),
      markParticipantErrored: vi.fn().mockResolvedValue(true),
      updateGroupProvider: vi.fn().mockResolvedValue({}),
      endSession: vi.fn().mockResolvedValue({}),
    };
    const dependencies = {
      repository,
      messagesRepository: {},
      liveAvatarProvider: {
        createLiteSessionToken: vi.fn().mockImplementation(({ avatarId }: { avatarId: string }) => {
          if (avatarId === "live-two") throw new Error("Provider unavailable");
          return Promise.resolve({ sessionToken: "token-one", sessionId: "live-session-one" });
        }),
        stopSession: vi.fn(),
      },
      elevenLabsAgentProvider: { syncAvatarAgent: vi.fn() },
      providerTokenProtector: { encrypt: (token: string) => `encrypted:${token}`, decrypt: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).start("user-1", "group-1", {
        consentScopeId: "scope-1",
        consentVersion: "1",
      })
    ).rejects.toThrow("No pudimos conectar el roster completo");

    expect(repository.endSession).toHaveBeenCalledWith("user-1", "group-session-1", "errored");
    expect(repository.activateParticipantConnection).toHaveBeenCalledTimes(1);
  });

  it("stops a provider session directly when durable cleanup cannot be registered", async () => {
    const participant = {
      id: "participant-one",
      avatarAgentId: "one",
      realtimeSessionId: null,
      status: "connecting",
      avatarAgent: {
        ...avatar("one"),
        groupProviderAgentId: "agent-one",
        groupProviderSyncFingerprint: "fingerprint-one",
        groupProviderSyncStatus: "synced",
      },
      realtimeSession: null,
    };
    const repository = {
      findAccessible: vi.fn().mockResolvedValue({ id: "group-1", ownerId: "owner-1" }),
      createSharedVoiceSession: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      }),
      findVoiceSessionForOwner: vi.fn().mockResolvedValue({
        id: "group-session-1",
        avatarGroupId: "group-1",
        conversationId: "conversation-1",
        status: "connecting",
        activatedAt: null,
        groupAccessGrantId: "grant-1",
        groupPublicSessionId: null,
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
        participants: [participant],
      }),
      createRealtimeParticipant: vi.fn().mockResolvedValue({ realtimeSessionId: "realtime-one" }),
      activateParticipantConnection: vi.fn().mockRejectedValue(new Error("database unavailable")),
      abandonParticipantConnection: vi.fn().mockRejectedValue(new Error("database unavailable")),
      markParticipantErrored: vi.fn().mockRejectedValue(new Error("database unavailable")),
      updateGroupProvider: vi.fn(),
      endSession: vi.fn().mockResolvedValue({}),
    };
    const stopSession = vi.fn().mockResolvedValue(undefined);
    const dependencies = {
      repository,
      messagesRepository: {},
      liveAvatarProvider: {
        createLiteSessionToken: vi.fn().mockResolvedValue({
          sessionToken: "provider-token-one",
          sessionId: "provider-session-one",
        }),
        stopSession,
      },
      elevenLabsAgentProvider: { syncAvatarAgent: vi.fn() },
      providerTokenProtector: { encrypt: (token: string) => `encrypted:${token}`, decrypt: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).start("user-1", "group-1", {
        consentScopeId: "scope-1",
        consentVersion: "1",
      })
    ).rejects.toThrow("No pudimos conectar el roster completo");

    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(stopSession).toHaveBeenCalledWith("provider-token-one");
    expect(repository.endSession).toHaveBeenCalledWith("user-1", "group-session-1", "errored");
  });

  it("does not plan the same final human transcript twice", async () => {
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
          activatedAt: new Date("2030-01-01T00:00:00.000Z"),
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants: [],
        }),
        beginRound: vi.fn().mockResolvedValue({
          kind: "duplicate",
          round: { id: "round-1", intent: "normal", status: "completed", contextVersion: 1 },
        }),
        currentDirectiveState: vi.fn().mockResolvedValue({
          session: { orchestrationPhase: "listening", floorLeaseExpiresAt: null },
          turn: null,
        }),
      },
      messagesRepository: {},
      orchestrator: { planRound: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).turn("user-1", "session-1", {
      sourceEventId: "scribe:1",
      content: "Hola",
    });

    expect(result).toMatchObject({
      round: { id: "round-1" },
      phase: "listening",
      directive: { action: "listen", reason: "duplicate" },
    });
    expect(dependencies.orchestrator.planRound).not.toHaveBeenCalled();
  });

  it("rebuilds a duplicate human-turn directive when the floor advances while context loads", async () => {
    const participants = ["one", "two"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      status: "active",
      avatarAgent: avatar(id),
      realtimeSession: null,
    }));
    const floorOne = queuedDirectiveState("one");
    const floorTwo = queuedDirectiveState("two");
    const currentDirectiveState = vi
      .fn()
      .mockResolvedValueOnce(floorOne)
      .mockResolvedValueOnce(floorTwo)
      .mockResolvedValueOnce(floorTwo);
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
          activatedAt: new Date("2030-01-01T00:00:00.000Z"),
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants,
        }),
        beginRound: vi.fn().mockResolvedValue({
          kind: "duplicate",
          round: { id: "round-1", intent: "normal", status: "queued", contextVersion: 1 },
        }),
        currentDirectiveState,
      },
      messagesRepository: { listByConversation: vi.fn().mockResolvedValue([]) },
      orchestrator: { planRound: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).turn("user-1", "session-1", {
      sourceEventId: "scribe:duplicate-race",
      content: "Pregunta duplicada",
    });

    expect(result).toMatchObject({
      phase: "queued",
      directive: { action: "speak", turnId: "turn-two", avatarId: "two" },
      floor: { turnId: "turn-two", avatarId: "two" },
    });
    expect(currentDirectiveState).toHaveBeenCalledTimes(3);
  });

  it("does not emit a speak directive when its lease expires while context loads", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2030-01-01T00:01:14.500Z"));
      const state = queuedDirectiveState("one");
      const dependencies = {
        repository: {
          findVoiceSessionForOwner: vi.fn().mockResolvedValue({
            id: "session-1",
            conversationId: "conversation-1",
            status: "active",
            activatedAt: new Date("2030-01-01T00:00:00.000Z"),
            expiresAt: new Date("2030-01-01T00:10:00.000Z"),
            participants: [
              {
                id: "participant-one",
                avatarAgentId: "one",
                status: "active",
                avatarAgent: avatar("one"),
                realtimeSession: null,
              },
            ],
          }),
          beginRound: vi.fn().mockResolvedValue({
            kind: "duplicate",
            round: { id: "round-1", intent: "normal", status: "queued", contextVersion: 1 },
          }),
          currentDirectiveState: vi.fn().mockResolvedValue(state),
        },
        messagesRepository: {
          listByConversation: vi.fn().mockImplementation(async () => {
            vi.setSystemTime(new Date("2030-01-01T00:01:15.001Z"));
            return [];
          }),
        },
        orchestrator: { planRound: vi.fn() },
      } as unknown as AvatarGroupsServiceDependencies;

      const result = await createAvatarGroupsService(dependencies).turn("user-1", "session-1", {
        sourceEventId: "scribe:expired-while-loading",
        content: "Pregunta duplicada",
      });

      expect(result).toMatchObject({
        phase: "queued",
        directive: null,
        floor: { turnId: "turn-one", avatarId: "one" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not return the user floor while another human turn is deliberating", async () => {
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
          activatedAt: new Date("2030-01-01T00:00:00.000Z"),
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants: [],
        }),
        beginRound: vi.fn().mockResolvedValue({ kind: "busy" }),
        currentDirectiveState: vi.fn().mockResolvedValue({
          session: { orchestrationPhase: "deliberating", floorLeaseExpiresAt: null },
          turn: null,
        }),
      },
      messagesRepository: {},
      orchestrator: { planRound: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).turn("user-1", "session-1", {
      sourceEventId: "scribe:busy",
      content: "Otro mensaje",
    });

    expect(result).toEqual({ round: null, phase: "deliberating", directive: null, floor: null });
    expect(dependencies.orchestrator.planRound).not.toHaveBeenCalled();
  });

  it("plans one fixed-order turn per avatar for an explicit group round", async () => {
    const participants = ["one", "two", "three"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      status: "active",
      avatarAgent: avatar(id),
      realtimeSession: null,
    }));
    const messages = Array.from({ length: 9 }, (_, index) => ({
      role: "user" as const,
      content:
        index === 0 ? `MENSAJE_ANTIGUO-${"x".repeat(1_500)}` : `historial-${index}-${"x".repeat(1_500)}`,
      speakerAvatarId: null,
    }));
    messages.push({
      role: "user",
      content: `MENSAJE_RECIENTE-Preséntense una vez cada uno-${"ñ".repeat(1_500)}`,
      speakerAvatarId: null,
    });
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
          activatedAt: new Date("2030-01-01T00:00:00.000Z"),
          rollingSummary: "",
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants,
        }),
        beginRound: vi.fn().mockResolvedValue({
          kind: "created",
          round: { id: "round-1", intent: "pending", status: "deliberating", contextVersion: 1 },
        }),
        queueRound: vi.fn().mockResolvedValue({
          turn: {
            id: "turn-one",
            avatarAgentId: "one",
            instructionText: "Presentate solamente vos.",
            avatarAgent: { name: "Avatar one" },
            round: { contextVersion: 1 },
          },
          leaseExpiresAt: new Date("2030-01-01T00:01:15.000Z"),
        }),
        currentDirectiveState: vi.fn().mockResolvedValue({
          session: {
            orchestrationPhase: "queued",
            floorOwnerAvatarId: "one",
            floorTurnId: "turn-one",
            floorLeaseExpiresAt: new Date("2030-01-01T00:01:15.000Z"),
          },
          turn: {
            id: "turn-one",
            avatarAgentId: "one",
            instructionText: "Presentate solamente vos.",
            status: "claimed",
            avatarAgent: { name: "Avatar one" },
            round: { contextVersion: 1 },
          },
        }),
      },
      messagesRepository: {
        listByConversation: vi.fn().mockResolvedValue(messages),
      },
      orchestrator: {
        planRound: vi.fn().mockResolvedValue({
          intent: "collective",
          instructions: ["one", "two", "three"].map((id) => ({
            avatarId: id,
            instruction: `Presentate como Avatar ${id}.`,
          })),
          routing: {
            version: 1,
            strategy: "deterministic",
            intent: "collective",
            speakerIds: ["one", "two", "three"],
            reason: "Pedido colectivo explícito",
            model: null,
            latencyMs: 0,
            fallbackReason: null,
            contextVersion: 1,
          },
        }),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).turn("user-1", "session-1", {
      sourceEventId: "scribe:event-1",
      content: "Preséntense una vez cada uno.",
    });

    expect(result.directive).toMatchObject({
      action: "speak",
      turnId: "turn-one",
      avatarId: "one",
      avatarName: "Avatar one",
      instruction: "Presentate solamente vos.",
      context: expect.stringContaining("Participantes en orden fijo"),
    });
    if (!result.directive || result.directive.action !== "speak") {
      throw new Error("Expected a speak directive");
    }
    expect(result.directive.action).toBe("speak");
    expect(new TextEncoder().encode(result.directive.context).byteLength).toBeLessThanOrEqual(9_000);
    expect(result.directive.context).toContain("MENSAJE_RECIENTE");
    expect(result.directive.context).not.toContain("MENSAJE_ANTIGUO");
    expect(dependencies.repository.queueRound).toHaveBeenCalledWith(
      "session-1",
      "round-1",
      expect.objectContaining({
        intent: "collective",
        routingPlan: expect.objectContaining({ strategy: "deterministic" }),
        turns: [
          { avatarAgentId: "one", position: 0, instructionText: "Presentate como Avatar one." },
          { avatarAgentId: "two", position: 1, instructionText: "Presentate como Avatar two." },
          { avatarAgentId: "three", position: 2, instructionText: "Presentate como Avatar three." },
        ],
      })
    );
  });

  it("returns the floor with a specific reason when a named participant disappears during routing", async () => {
    const participant = {
      id: "participant-one",
      avatarAgentId: "one",
      status: "active",
      avatarAgent: avatar("one"),
      realtimeSession: null,
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
          activatedAt: new Date("2030-01-01T00:00:00.000Z"),
          rollingSummary: "",
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants: [participant],
        }),
        beginRound: vi.fn().mockResolvedValue({
          kind: "created",
          round: { id: "round-1", intent: "pending", status: "deliberating", contextVersion: 1 },
        }),
        queueRound: vi.fn().mockResolvedValue(null),
        currentDirectiveState: vi.fn().mockResolvedValue({
          session: {
            orchestrationPhase: "listening",
            floorOwnerAvatarId: null,
            floorTurnId: null,
            floorLeaseExpiresAt: null,
          },
          turn: null,
        }),
      },
      messagesRepository: { listByConversation: vi.fn().mockResolvedValue([]) },
      orchestrator: {
        planRound: vi.fn().mockResolvedValue({
          intent: "named",
          instructions: [{ avatarId: "one", instruction: "Respondé la mención." }],
          routing: {
            version: 1,
            strategy: "explicit_name",
            intent: "named",
            speakerIds: ["one"],
            reason: "Mención explícita",
            model: null,
            latencyMs: 0,
            fallbackReason: null,
            contextVersion: 1,
          },
        }),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).turn("user-1", "session-1", {
      sourceEventId: "scribe:named-unavailable",
      content: "Avatar one, respondé vos",
    });

    expect(result).toMatchObject({
      phase: "listening",
      directive: { action: "listen", reason: "mentioned_participant_unavailable" },
      floor: null,
    });
  });

  it("claims expired sessions and leaves provider cleanup to the durable worker", async () => {
    const stopSession = vi.fn().mockResolvedValue(undefined);
    const expireVoiceSessionIfStale = vi.fn().mockResolvedValue(true);
    const dependencies = {
      repository: {
        recoverStaleDeliberatingRounds: vi.fn().mockResolvedValue(0),
        listExpiredFloorSessions: vi.fn().mockResolvedValue([]),
        listExpiredVoiceSessions: vi.fn().mockResolvedValue([
          {
            id: "session-expired",
            ownerId: "user-1",
            participants: [
              {
                realtimeSession: {
                  providerSessionTokenCiphertext: "ciphertext",
                  providerStoppedAt: null,
                },
              },
            ],
          },
        ]),
        expireVoiceSessionIfStale,
        enqueuePendingSessionCleanups: vi.fn().mockResolvedValue(1),
      },
      liveAvatarProvider: { stopSession },
      providerTokenProtector: { decrypt: () => "provider-token" },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(createAvatarGroupsService(dependencies).cleanupExpired()).resolves.toBe(1);
    expect(stopSession).not.toHaveBeenCalled();
    expect(expireVoiceSessionIfStale).toHaveBeenCalledWith("user-1", "session-expired", expect.any(Date));
  });

  it("does not close or count a candidate that heartbeated after the cleanup scan", async () => {
    const now = new Date("2030-01-01T00:02:00.000Z");
    const expireVoiceSessionIfStale = vi.fn().mockResolvedValue(false);
    const dependencies = {
      repository: {
        recoverStaleDeliberatingRounds: vi.fn().mockResolvedValue(0),
        listExpiredFloorSessions: vi.fn().mockResolvedValue([]),
        listExpiredVoiceSessions: vi.fn().mockResolvedValue([
          {
            id: "session-refreshed",
            ownerId: "user-1",
            groupPublicSessionId: null,
          },
        ]),
        expireVoiceSessionIfStale,
        enqueuePendingSessionCleanups: vi.fn().mockResolvedValue(0),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(createAvatarGroupsService(dependencies).cleanupExpired(now)).resolves.toBe(0);
    expect(expireVoiceSessionIfStale).toHaveBeenCalledWith("user-1", "session-refreshed", now);
  });

  it("does not acknowledge a heartbeat after cleanup claimed the session", async () => {
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-ended-concurrently",
          status: "active",
          activatedAt: new Date("2030-01-01T00:00:00.000Z"),
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
        }),
        heartbeat: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).heartbeat("user-1", "session-ended-concurrently")
    ).rejects.toThrow("La llamada ya terminó");
  });

  it("suppresses an unauthorized speaker without interrupting the valid floor", async () => {
    const interruptRound = vi.fn();
    const session = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01T00:00:00.000Z"),
      orchestrationPhase: "queued",
      floorOwnerAvatarId: "avatar-valid",
      floorTurnId: "turn-valid",
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      participants: [],
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        recordProviderEvent: vi.fn().mockResolvedValue({
          kind: "unauthorized",
          reason: "unknown_turn",
          session,
          next: null,
        }),
        interruptRound,
      },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).providerEvent("user-1", "session-1", {
      sourceEventId: "rogue:start:1",
      turnId: null,
      avatarId: "avatar-rogue",
      type: "speak_started",
    });

    expect(result).toEqual({
      phase: "queued",
      directive: {
        action: "suppress",
        avatarId: "avatar-rogue",
        reason: "unauthorized_audio",
      },
      floor: null,
    });
    expect(interruptRound).not.toHaveBeenCalled();
  });

  it("reconstructs suppress and listen directives for duplicate provider deliveries", async () => {
    const queuedSession = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01T00:00:00.000Z"),
      orchestrationPhase: "queued",
      floorOwnerAvatarId: "avatar-valid",
      floorTurnId: "turn-valid",
      floorLeaseExpiresAt: new Date("2030-01-01T00:01:15.000Z"),
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      participants: [],
    };
    const listeningSession = {
      ...queuedSession,
      orchestrationPhase: "listening",
      floorOwnerAvatarId: null,
      floorTurnId: null,
      floorLeaseExpiresAt: null,
    };
    const currentDirectiveState = vi
      .fn()
      .mockResolvedValueOnce({ session: queuedSession, turn: null })
      .mockResolvedValueOnce({ session: listeningSession, turn: null });
    const findVoiceSessionForOwner = vi.fn().mockResolvedValue(queuedSession);
    const dependencies = {
      repository: {
        findVoiceSessionForOwner,
        recordProviderEvent: vi
          .fn()
          .mockResolvedValueOnce({ kind: "duplicate", session: queuedSession, next: null })
          .mockResolvedValueOnce({ kind: "duplicate", session: listeningSession, next: null }),
        currentDirectiveState,
      },
    } as unknown as AvatarGroupsServiceDependencies;
    const service = createAvatarGroupsService(dependencies);

    await expect(
      service.providerEvent("user-1", "session-1", {
        sourceEventId: "rogue:start:duplicate",
        turnId: null,
        avatarId: "avatar-rogue",
        type: "speak_started",
      })
    ).resolves.toEqual({
      phase: "queued",
      directive: {
        action: "suppress",
        avatarId: "avatar-rogue",
        reason: "unauthorized_audio",
      },
      floor: {
        avatarId: "avatar-valid",
        turnId: "turn-valid",
        leaseExpiresAt: "2030-01-01T00:01:15.000Z",
      },
    });
    findVoiceSessionForOwner.mockResolvedValueOnce(listeningSession);
    await expect(
      service.providerEvent("user-1", "session-1", {
        sourceEventId: "interruption:duplicate",
        turnId: "turn-old",
        avatarId: "avatar-old",
        type: "interruption",
      })
    ).resolves.toEqual({
      phase: "listening",
      directive: null,
      floor: null,
    });
  });

  it("drops a stale duplicate end directive when the floor returns to listening during context load", async () => {
    const queued = queuedDirectiveState("new", "turn-new");
    const currentDirectiveState = vi
      .fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(listeningDirectiveState());
    const session = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01T00:00:00.000Z"),
      orchestrationPhase: "queued",
      floorOwnerAvatarId: "new",
      floorTurnId: "turn-new",
      floorLeaseExpiresAt: new Date("2030-01-01T00:01:15.000Z"),
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      participants: [
        {
          id: "participant-new",
          avatarAgentId: "new",
          status: "active",
          avatarAgent: avatar("new"),
          realtimeSession: null,
        },
      ],
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        recordProviderEvent: vi.fn().mockResolvedValue({ kind: "duplicate", session, next: null }),
        currentDirectiveState,
      },
      messagesRepository: { listByConversation: vi.fn().mockResolvedValue([]) },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).providerEvent("user-1", "session-1", {
        sourceEventId: "stale:end:duplicate",
        turnId: "turn-old",
        avatarId: "old",
        type: "speak_ended",
      })
    ).resolves.toEqual({ phase: "listening", directive: null, floor: null });
  });

  it("accepts a completed-turn correction after the call ended but rejects late speech", async () => {
    const session = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "ended",
      activatedAt: new Date("2029-01-01T00:00:00.000Z"),
      orchestrationPhase: "ended",
      floorOwnerAvatarId: null,
      floorTurnId: null,
      floorLeaseExpiresAt: null,
      expiresAt: new Date("2029-01-01T00:10:00.000Z"),
      participants: [],
    };
    const recordProviderEvent = vi.fn().mockResolvedValue({
      kind: "late_updated",
      session,
      next: null,
    });
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        recordProviderEvent,
      },
    } as unknown as AvatarGroupsServiceDependencies;
    const service = createAvatarGroupsService(dependencies);

    await expect(
      service.providerEvent("user-1", "session-1", {
        sourceEventId: "late:correction:after-end",
        turnId: "turn-completed",
        avatarId: "avatar-one",
        type: "agent_response_correction",
        content: "Respuesta corregida",
      })
    ).resolves.toEqual({ phase: "ended", directive: null, floor: null });
    expect(recordProviderEvent).toHaveBeenCalledTimes(1);

    await expect(
      service.providerEvent("user-1", "session-1", {
        sourceEventId: "late:start:after-end",
        turnId: "turn-completed",
        avatarId: "avatar-one",
        type: "speak_started",
      })
    ).rejects.toThrow("La llamada ya terminó");
    expect(recordProviderEvent).toHaveBeenCalledTimes(1);
  });

  it("does not suppress a newer floor owned by the same avatar for a stale start retry", async () => {
    const session = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01T00:00:00.000Z"),
      orchestrationPhase: "queued",
      floorOwnerAvatarId: "avatar-one",
      floorTurnId: "turn-new",
      floorLeaseExpiresAt: new Date("2030-01-01T00:01:15.000Z"),
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      participants: [],
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        recordProviderEvent: vi.fn().mockResolvedValue({
          kind: "duplicate",
          session,
          next: null,
        }),
        currentDirectiveState: vi.fn().mockResolvedValue({
          session,
          turn: { id: "turn-new", avatarAgentId: "avatar-one" },
        }),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).providerEvent("user-1", "session-1", {
        sourceEventId: "stale:start:retry",
        turnId: "turn-old",
        avatarId: "avatar-one",
        type: "speak_started",
      })
    ).resolves.toEqual({
      phase: "queued",
      directive: null,
      floor: {
        avatarId: "avatar-one",
        turnId: "turn-new",
        leaseExpiresAt: "2030-01-01T00:01:15.000Z",
      },
    });
  });

  it("treats an interrupt for an old floor owner as a no-op", async () => {
    const session = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01T00:00:00.000Z"),
      orchestrationPhase: "speaking",
      floorOwnerAvatarId: "avatar-new",
      floorTurnId: "turn-new",
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      participants: [],
    };
    const interruptRound = vi.fn().mockResolvedValue({
      kind: "stale",
      session,
      avatarId: "avatar-new",
    });
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        interruptRound,
      },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).interrupt("user-1", "session-1", {
      reason: "user",
      expectedAvatarId: "avatar-old",
      expectedTurnId: "turn-old",
      trigger: "voice",
      sourceEventId: "scribe:interruption-old",
    });

    expect(result).toEqual({ phase: "speaking", directive: null, floor: null });
    expect(interruptRound).toHaveBeenCalledWith("user-1", "session-1", {
      avatarId: "avatar-old",
      turnId: "turn-old",
      sourceEventId: "scribe:interruption-old",
    });
  });

  it("advances to the next active avatar after the floor owner fails", async () => {
    const participants = ["one", "two"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      status: "active",
      avatarAgent: avatar(id),
      realtimeSession: null,
    }));
    const session = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01T00:00:00.000Z"),
      orchestrationPhase: "speaking",
      floorOwnerAvatarId: "one",
      floorTurnId: "turn-one",
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      participants,
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        failParticipant: vi.fn().mockResolvedValue({
          kind: "next",
          session,
          participant: {
            ...participants[0],
            status: "errored",
            errorMessage: "LiveAvatar disconnected",
          },
          next: {
            turn: {
              id: "turn-two",
              avatarAgentId: "two",
              instructionText: "Continuá la ronda.",
              avatarAgent: { name: "Avatar two" },
            },
            leaseExpiresAt: new Date("2030-01-01T00:01:15.000Z"),
          },
        }),
        currentDirectiveState: vi.fn().mockResolvedValue({
          session: {
            orchestrationPhase: "queued",
            floorOwnerAvatarId: "two",
            floorTurnId: "turn-two",
            floorLeaseExpiresAt: new Date("2030-01-01T00:01:15.000Z"),
          },
          turn: {
            id: "turn-two",
            avatarAgentId: "two",
            instructionText: "Continuá la ronda.",
            status: "claimed",
            avatarAgent: { name: "Avatar two" },
          },
        }),
      },
      messagesRepository: { listByConversation: vi.fn().mockResolvedValue([]) },
    } as unknown as AvatarGroupsServiceDependencies;

    const result = await createAvatarGroupsService(dependencies).participantFailure(
      "user-1",
      "session-1",
      "one",
      {
        sourceEventId: "participant:error:one:1",
        participantAttemptId: "realtime-one",
        reason: "stream_error",
        expectedTurnId: "turn-one",
      }
    );

    expect(result).toMatchObject({
      phase: "queued",
      participant: { avatarId: "one", status: "errored" },
      directive: { action: "speak", turnId: "turn-two", avatarId: "two" },
    });
  });

  it("does not emit the next participant after failure when that floor disappears during context load", async () => {
    const participants = ["one", "two"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      status: "active",
      avatarAgent: avatar(id),
      realtimeSessionId: `realtime-${id}`,
      realtimeSession: null,
    }));
    const session = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01T00:00:00.000Z"),
      orchestrationPhase: "speaking",
      floorOwnerAvatarId: "one",
      floorTurnId: "turn-one",
      expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      participants,
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        failParticipant: vi.fn().mockResolvedValue({
          kind: "next",
          session,
          participant: {
            ...participants[0],
            status: "errored",
            errorMessage: "LiveAvatar disconnected",
          },
          next: { turn: queuedDirectiveState("two").turn },
        }),
        currentDirectiveState: vi
          .fn()
          .mockResolvedValueOnce(queuedDirectiveState("two"))
          .mockResolvedValueOnce(listeningDirectiveState()),
      },
      messagesRepository: { listByConversation: vi.fn().mockResolvedValue([]) },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).participantFailure("user-1", "session-1", "one", {
        sourceEventId: "participant:error:race",
        participantAttemptId: "realtime-one",
        reason: "stream_error",
        expectedTurnId: "turn-one",
      })
    ).resolves.toMatchObject({
      phase: "listening",
      directive: null,
      floor: null,
      participant: { avatarId: "one", status: "errored" },
    });
  });

  it("claims participant retry before reconnecting providers", async () => {
    const participant = {
      id: "participant-one",
      avatarAgentId: "one",
      status: "errored",
      avatarAgent: avatar("one"),
      realtimeSession: null,
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
          activatedAt: new Date("2030-01-01T00:00:00.000Z"),
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants: [participant],
        }),
        beginParticipantRetry: vi.fn().mockResolvedValue(null),
      },
      liveAvatarProvider: { stopSession: vi.fn() },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(createAvatarGroupsService(dependencies).retry("user-1", "session-1", "one")).rejects.toThrow(
      "ya se está reconectando"
    );
    expect(dependencies.liveAvatarProvider.stopSession).not.toHaveBeenCalled();
  });

  it("confirms the current participant attempt after the client starts", async () => {
    const confirmParticipantStarted = vi.fn().mockResolvedValue(true);
    const markSessionActive = vi.fn().mockResolvedValue(true);
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          avatarGroupId: "group-1",
          status: "connecting",
          activatedAt: null,
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants: [],
        }),
        confirmParticipantStarted,
        markSessionActive,
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).confirmParticipantStarted("user-1", "session-1", "avatar-1", {
        participantAttemptId: "realtime-1",
      })
    ).resolves.toEqual({ ok: true, status: "active" });
    expect(confirmParticipantStarted).toHaveBeenCalledWith("user-1", "session-1", "avatar-1", "realtime-1");
    expect(markSessionActive).toHaveBeenCalledWith("session-1");
  });

  it("keeps the session connecting until the repository confirms the full roster", async () => {
    const markSessionActive = vi.fn().mockResolvedValue(false);
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "connecting",
          activatedAt: null,
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants: [],
        }),
        confirmParticipantStarted: vi.fn().mockResolvedValue(true),
        markSessionActive,
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).confirmParticipantStarted("user-1", "session-1", "avatar-1", {
        participantAttemptId: "realtime-1",
      })
    ).resolves.toEqual({ ok: true, status: "connecting" });
    expect(markSessionActive).toHaveBeenCalledWith("session-1");
  });

  it("rejects a stale participant start confirmation", async () => {
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "connecting",
          activatedAt: null,
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants: [],
        }),
        confirmParticipantStarted: vi.fn().mockResolvedValue(false),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).confirmParticipantStarted("user-1", "session-1", "avatar-1", {
        participantAttemptId: "realtime-stale",
      })
    ).rejects.toThrow("Intento de participante no encontrado");
  });

  it("passes interrupted drafts and provider fragments separately to routing and the next avatar", async () => {
    const queued = queuedDirectiveState("two");
    const interruptedTurns = [
      {
        turnId: "old-turn",
        avatarAgentId: "one",
        generatedText: "BORRADOR_PENDIENTE",
        reportedFragment: "FRAGMENTO_INFORMADO",
        fragmentSource: "agent_response_correction",
      },
    ];
    const session = {
      ...queued.session,
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01"),
      expiresAt: new Date("2030-01-02"),
      rollingSummary: "",
      interruptionEvents: [{ sourceEventId: "scribe:cut", interruptedTurns }],
      participants: ["one", "two"].map((id) => ({
        avatarAgentId: id,
        status: "active",
        avatarAgent: avatar(id),
      })),
    };
    const planRound = vi.fn().mockResolvedValue({
      intent: "normal",
      instructions: [{ avatarId: "two", instruction: "Respondé la nueva pregunta" }],
      routing: { strategy: "model", model: "test", fallbackReason: null },
    });
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        beginRound: vi.fn().mockResolvedValue({
          kind: "created",
          round: { id: "round-new", userMessageId: "human-new", contextVersion: 2 },
        }),
        queueRound: vi.fn().mockResolvedValue(queued),
        currentDirectiveState: vi.fn().mockResolvedValue(queued),
      },
      messagesRepository: {
        listByConversation: vi.fn().mockResolvedValue([
          { id: "human-old", role: "user", content: "Pregunta anterior" },
          { id: "fragment", role: "assistant", content: "FRAGMENTO_INFORMADO", speakerAvatarId: "one" },
          { id: "human-new", role: "user", content: "Ahora preguntale al otro" },
        ]),
      },
      orchestrator: { planRound },
    } as unknown as AvatarGroupsServiceDependencies;
    const result = await createAvatarGroupsService(dependencies).turn("user-1", "session-1", {
      sourceEventId: "human-new",
      content: "Ahora preguntale al otro",
    });
    expect(planRound).toHaveBeenCalledWith(
      expect.objectContaining({
        interruptions: [
          {
            sourceEventId: "scribe:cut",
            turnId: "old-turn",
            avatarId: "one",
            generatedDraft: "BORRADOR_PENDIENTE",
            reportedFragment: "FRAGMENTO_INFORMADO",
            fragmentSource: "agent_response_correction",
            heardCertainty: "unknown",
          },
        ],
      })
    );
    const input = planRound.mock.calls[0]?.[0] as { transcript: Array<{ content: string }> };
    expect(input.transcript.some((message) => message.content.includes("BORRADOR_PENDIENTE"))).toBe(false);
    expect(result.directive).toMatchObject({
      action: "speak",
      context: expect.stringContaining("NO confirmado como pronunciado"),
    });
    expect(result.directive).toMatchObject({ context: expect.stringContaining("BORRADOR_PENDIENTE") });
    expect(result.directive).toMatchObject({ context: expect.stringContaining("FRAGMENTO_INFORMADO") });
  });

  it("bounds long multibyte interruption names and retains the current human request within 9000 bytes", async () => {
    const queued = queuedDirectiveState("two");
    const participants = ["one", "two", "three"].map((id) => ({
      avatarAgentId: id,
      status: "active",
      avatarAgent: { ...avatar(id), name: "ñ".repeat(20_000), description: "d".repeat(5_000) },
    }));
    const interruptionEvents = [1, 2, 3].map((id) => ({
      sourceEventId: `cut:${id}`,
      interruptedTurns: [
        {
          turnId: `old-${id}`,
          avatarAgentId: "one",
          generatedText: "ñ".repeat(8_000),
          reportedFragment: "ñ".repeat(8_000),
          fragmentSource: "agent_response_correction",
        },
      ],
    }));
    const session = {
      ...queued.session,
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
      activatedAt: new Date("2030-01-01"),
      expiresAt: new Date("2030-01-02"),
      participants,
      interruptionEvents,
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        recordProviderEvent: vi.fn().mockResolvedValue({ kind: "next", next: queued.turn }),
        currentDirectiveState: vi.fn().mockResolvedValue(queued),
      },
      messagesRepository: {
        listByConversation: vi
          .fn()
          .mockResolvedValue([{ role: "user", content: "PEDIDO_ACTUAL_CONSERVADO" }]),
      },
    } as unknown as AvatarGroupsServiceDependencies;
    const result = await createAvatarGroupsService(dependencies).providerEvent("user-1", "session-1", {
      sourceEventId: "old:end",
      avatarId: "one",
      turnId: "old-turn",
      type: "speak_ended",
    });
    expect(result.directive).toMatchObject({
      action: "speak",
      context: expect.stringContaining("PEDIDO_ACTUAL_CONSERVADO"),
    });
    if (result.directive?.action !== "speak") throw new Error("Expected speak directive");
    expect(new TextEncoder().encode(result.directive.context).byteLength).toBeLessThanOrEqual(9_000);
  });

  it.each(["stale", "duplicate"])(
    "does not end a two-avatar call for a %s old failure during replacement",
    async (kind) => {
      const participant = {
        avatarAgentId: "one",
        realtimeSessionId: "replacement-one",
        status: "connecting",
        errorMessage: null,
      };
      const session = {
        id: "session-1",
        status: "active",
        activatedAt: new Date("2030-01-01"),
        expiresAt: new Date("2030-01-02"),
        orchestrationPhase: "listening",
        participants: [
          participant,
          { avatarAgentId: "two", realtimeSessionId: "attempt-two", status: "active" },
        ],
      };
      const endSession = vi.fn();
      const dependencies = {
        repository: {
          findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
          failParticipant: vi.fn().mockResolvedValue({ kind, session, participant, next: null }),
          currentDirectiveState: vi.fn().mockResolvedValue({ session, turn: null }),
          endSession,
        },
      } as unknown as AvatarGroupsServiceDependencies;
      await expect(
        createAvatarGroupsService(dependencies).participantFailure("user-1", "session-1", "one", {
          sourceEventId: "old-failure",
          participantAttemptId: "attempt-one",
          reason: "session_stopped",
        })
      ).resolves.toMatchObject({ phase: "listening" });
      expect(endSession).not.toHaveBeenCalled();
    }
  );

  it("counts human receipt-owned connecting replacements when another participant fails", async () => {
    const failed = {
      avatarAgentId: "three",
      realtimeSessionId: "attempt-three",
      status: "errored",
      errorMessage: "stopped",
    };
    const session = {
      id: "session-1",
      status: "active",
      activatedAt: new Date("2030-01-01"),
      expiresAt: new Date("2030-01-02"),
      orchestrationPhase: "listening",
      participants: ["one", "two"]
        .map((id) => ({ avatarAgentId: id, realtimeSessionId: `replacement-${id}`, status: "connecting" }))
        .concat([failed]),
      interruptionEvents: [
        {
          affectedParticipants: [
            { replacementAttemptId: "replacement-one" },
            { replacementAttemptId: "replacement-two" },
          ],
        },
      ],
    };
    const endSession = vi.fn();
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue(session),
        failParticipant: vi
          .fn()
          .mockResolvedValue({ kind: "completed", session, participant: failed, next: null }),
        endSession,
      },
    } as unknown as AvatarGroupsServiceDependencies;
    await expect(
      createAvatarGroupsService(dependencies).participantFailure("user-1", "session-1", "three", {
        sourceEventId: "current-failure",
        participantAttemptId: "attempt-three",
        reason: "session_stopped",
      })
    ).resolves.toMatchObject({ phase: "listening" });
    expect(endSession).not.toHaveBeenCalled();
  });

  it("replays a prepared replacement token without allocating another provider session", async () => {
    const prepared = {
      id: "participant",
      avatarAgentId: "one",
      realtimeSessionId: "replacement",
      status: "active",
      avatarAgent: avatar("one"),
      realtimeSession: {
        providerSessionTokenCiphertext: "encrypted-token",
        providerSessionId: "provider-session",
      },
      retryAlreadyPrepared: true,
    };
    const beginParticipantRetry = vi.fn().mockResolvedValue(prepared);
    const createLiteSessionToken = vi.fn();
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          status: "active",
          activatedAt: new Date("2030-01-01"),
          expiresAt: new Date("2030-01-02"),
          participants: [prepared],
        }),
        beginParticipantRetry,
      },
      liveAvatarProvider: { createLiteSessionToken },
      providerTokenProtector: { decrypt: vi.fn().mockReturnValue("recovered-token") },
    } as unknown as AvatarGroupsServiceDependencies;
    await expect(
      createAvatarGroupsService(dependencies).retry("user-1", "session-1", "one", {
        interruptionSourceEventId: "human-cut",
        failedParticipantAttemptId: "old-replacement",
      })
    ).resolves.toMatchObject({ participantAttemptId: "replacement", sessionToken: "recovered-token" });
    expect(createLiteSessionToken).not.toHaveBeenCalled();
    expect(beginParticipantRetry).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "one",
      "human-cut",
      "old-replacement"
    );
  });

  it("replayed human cancellation reports the current floor without dispatching a stale interrupt", async () => {
    const queued = queuedDirectiveState("two");
    const interruption = {
      sourceEventId: "human-cut",
      status: "cancelled",
      turnId: "old-turn",
      avatarIds: ["one"],
    };
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          ...queued.session,
          status: "active",
          activatedAt: new Date("2030-01-01"),
          expiresAt: new Date("2030-01-02"),
        }),
        interruptRound: vi.fn().mockResolvedValue({
          kind: "interrupted",
          session: queued.session,
          avatarId: null,
          replayed: true,
          interruption,
        }),
      },
    } as unknown as AvatarGroupsServiceDependencies;
    await expect(
      createAvatarGroupsService(dependencies).interrupt("user-1", "session-1", {
        reason: "user",
        trigger: "voice",
        sourceEventId: "human-cut",
        expectedTurnId: "old-turn",
        expectedAvatarId: "one",
      })
    ).resolves.toMatchObject({
      phase: "queued",
      directive: null,
      floor: { turnId: queued.turn.id, avatarId: "two" },
      interruption,
    });
  });

  it.each(["ready", "duplicate"])(
    "acknowledges %s interruption reuse without touching providers",
    async (kind) => {
      const state = listeningDirectiveState();
      const markParticipantInterruptionReady = vi.fn().mockResolvedValue({ kind, ...state, participant: {} });
      const beginParticipantRetry = vi.fn();
      const stopSession = vi.fn();
      const dependencies = {
        repository: {
          findVoiceSessionForOwner: vi.fn().mockResolvedValue({
            ...state.session,
            status: "active",
            activatedAt: new Date("2030-01-01"),
            expiresAt: new Date("2030-01-02"),
          }),
          markParticipantInterruptionReady,
          beginParticipantRetry,
        },
        liveAvatarProvider: { stopSession },
      } as unknown as AvatarGroupsServiceDependencies;
      const input = interruptionReadyInput();

      await expect(
        createAvatarGroupsService(dependencies).confirmParticipantInterruptionReady(
          "user-1",
          "session-1",
          "one",
          input
        )
      ).resolves.toEqual({ applied: true, phase: "listening", directive: null, floor: null });
      expect(markParticipantInterruptionReady).toHaveBeenCalledWith("user-1", "session-1", "one", input);
      expect(beginParticipantRetry).not.toHaveBeenCalled();
      expect(stopSession).not.toHaveBeenCalled();
    }
  );

  it("reports a stale reuse acknowledgement with the newer floor and no dispatch", async () => {
    const queued = queuedDirectiveState("two");
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          ...queued.session,
          status: "active",
          activatedAt: new Date("2030-01-01"),
          expiresAt: new Date("2030-01-02"),
        }),
        markParticipantInterruptionReady: vi
          .fn()
          .mockResolvedValue({ kind: "stale", ...queued, participant: null }),
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).confirmParticipantInterruptionReady(
        "user-1",
        "session-1",
        "one",
        interruptionReadyInput()
      )
    ).resolves.toMatchObject({
      applied: false,
      phase: "queued",
      directive: null,
      floor: { turnId: queued.turn.id, avatarId: "two" },
    });
  });

  it("recovers stale deliberations before cleaning floor leases", async () => {
    const recoverStaleDeliberatingRounds = vi.fn().mockResolvedValue(1);
    const dependencies = {
      repository: {
        recoverStaleDeliberatingRounds,
        listExpiredFloorSessions: vi.fn().mockResolvedValue([]),
        listExpiredVoiceSessions: vi.fn().mockResolvedValue([]),
        enqueuePendingSessionCleanups: vi.fn().mockResolvedValue(0),
      },
    } as unknown as AvatarGroupsServiceDependencies;
    const now = new Date("2030-01-01T00:00:30.000Z");

    await expect(createAvatarGroupsService(dependencies).cleanupExpired(now)).resolves.toBe(0);
    expect(recoverStaleDeliberatingRounds).toHaveBeenCalledWith(new Date("2030-01-01T00:00:15.000Z"));
  });
});

function interruptionReadyInput() {
  return {
    interruptionSourceEventId: "human-cut",
    participantAttemptId: "attempt-one",
    interruptedTurnId: "turn-one",
    evidence: { type: "speak_ended" as const, eventId: "terminal-one", speechSourceEventId: "speech-one" },
  };
}

describe("authenticated group interruption readiness controller", () => {
  async function controllerFixture() {
    const state = listeningDirectiveState();
    const markParticipantInterruptionReady = vi
      .fn()
      .mockResolvedValue({ kind: "ready", ...state, participant: {} });
    const findVoiceSessionForOwner = vi.fn(async (principalId: string, sessionId: string) =>
      ["owner-1", "shared-participant-1"].includes(principalId) && sessionId === "session-1"
        ? {
            ...state.session,
            status: "active",
            activatedAt: new Date("2030-01-01"),
            expiresAt: new Date("2030-01-02"),
          }
        : null
    );
    const dependencies = {
      repository: { findVoiceSessionForOwner, markParticipantInterruptionReady },
    } as unknown as AvatarGroupsServiceDependencies;
    const app = new Hono<CreatorSessionEnv>();
    app.use(
      "*",
      createCreatorSessionMiddleware({
        async findPublicById(id) {
          return {
            id,
            name: "Participant",
            email: `${id}@example.com`,
            imageUrl: null,
            createdAt: new Date("2030-01-01"),
            updatedAt: new Date("2030-01-01"),
          };
        },
      })
    );
    app.route("/", createAvatarGroupsController(dependencies));
    async function request(principalId?: string, body: unknown = interruptionReadyInput()) {
      const token = principalId
        ? await createSessionToken({
            id: principalId,
            name: "Participant",
            email: `${principalId}@example.com`,
          })
        : null;
      return app.request("/group-voice-sessions/session-1/participants/one/interruption-ready", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    }
    return { request, findVoiceSessionForOwner, markParticipantInterruptionReady };
  }

  it.each(["owner-1", "shared-participant-1"])(
    "uses the current %s principal for a reuse acknowledgement",
    async (principalId) => {
      const { request, findVoiceSessionForOwner, markParticipantInterruptionReady } =
        await controllerFixture();
      const response = await request(principalId);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        applied: true,
        phase: "listening",
        directive: null,
        floor: null,
      });
      expect(findVoiceSessionForOwner).toHaveBeenCalledWith(principalId, "session-1");
      expect(markParticipantInterruptionReady).toHaveBeenCalledWith(
        principalId,
        "session-1",
        "one",
        interruptionReadyInput()
      );
    }
  );

  it("requires a session and rejects inaccessible calls before acknowledging reuse", async () => {
    const { request, markParticipantInterruptionReady } = await controllerFixture();
    expect((await request()).status).toBe(401);
    expect((await request("unrelated-user")).status).toBe(404);
    expect(markParticipantInterruptionReady).not.toHaveBeenCalled();
  });

  it("requires correlated terminal evidence or an explicit not-dispatched acknowledgement", async () => {
    const { request, markParticipantInterruptionReady } = await controllerFixture();
    expect(
      (
        await request("owner-1", {
          ...interruptionReadyInput(),
          evidence: { type: "speak_ended", eventId: "terminal-one" },
        })
      ).status
    ).toBe(400);
    expect(markParticipantInterruptionReady).not.toHaveBeenCalled();
    expect(
      (
        await request("owner-1", {
          ...interruptionReadyInput(),
          evidence: { type: "not_dispatched" },
        })
      ).status
    ).toBe(200);
  });
});
