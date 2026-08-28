import { describe, expect, it, vi } from "vitest";
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

  it("keeps a partially connected group alive and reports the failed participant", async () => {
    const participants = ["one", "two"].map((id) => ({
      id: `participant-${id}`,
      avatarAgentId: id,
      realtimeSessionId: null,
      status: "connecting",
      avatarAgent: avatar(id),
      realtimeSession: null,
    }));
    const repository = {
      createVoiceSession: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      }),
      findVoiceSessionForOwner: vi.fn().mockResolvedValue({
        id: "group-session-1",
        conversationId: "conversation-1",
        status: "connecting",
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
      markSessionActive: vi.fn().mockResolvedValue(true),
      endSession: vi.fn().mockResolvedValue({}),
    };
    const liveAvatarProvider = {
      createLiteSessionToken: vi.fn().mockImplementation(({ avatarId }: { avatarId: string }) => {
        if (avatarId === "live-two") throw new Error("Provider unavailable");
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

    expect(result.status).toBe("degraded");
    expect(result.participants.map((participant) => participant.status)).toEqual(["active", "errored"]);
    expect(repository.markSessionActive).toHaveBeenCalledWith("group-session-1");
    expect(repository.endSession).not.toHaveBeenCalled();
  });

  it("does not plan the same final human transcript twice", async () => {
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
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

  it("ends expired sessions and leaves provider cleanup to the durable worker", async () => {
    const stopSession = vi.fn().mockResolvedValue(undefined);
    const endSession = vi.fn().mockResolvedValue({});
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
        endSession,
        enqueuePendingSessionCleanups: vi.fn().mockResolvedValue(1),
      },
      liveAvatarProvider: { stopSession },
      providerTokenProtector: { decrypt: () => "provider-token" },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(createAvatarGroupsService(dependencies).cleanupExpired()).resolves.toBe(1);
    expect(stopSession).not.toHaveBeenCalled();
    expect(endSession).toHaveBeenCalledWith("user-1", "session-expired");
  });

  it("suppresses an unauthorized speaker without interrupting the valid floor", async () => {
    const interruptRound = vi.fn();
    const session = {
      id: "session-1",
      conversationId: "conversation-1",
      status: "active",
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
      directive: { action: "listen", reason: "interrupted" },
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
    });

    expect(result).toEqual({ phase: "speaking", directive: null, floor: null });
    expect(interruptRound).toHaveBeenCalledWith("user-1", "session-1", {
      avatarId: "avatar-old",
      turnId: "turn-old",
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
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
          expiresAt: new Date("2030-01-01T00:10:00.000Z"),
          participants: [],
        }),
        confirmParticipantStarted,
      },
    } as unknown as AvatarGroupsServiceDependencies;

    await expect(
      createAvatarGroupsService(dependencies).confirmParticipantStarted("user-1", "session-1", "avatar-1", {
        participantAttemptId: "realtime-1",
      })
    ).resolves.toEqual({ ok: true });
    expect(confirmParticipantStarted).toHaveBeenCalledWith("user-1", "session-1", "avatar-1", "realtime-1");
  });

  it("rejects a stale participant start confirmation", async () => {
    const dependencies = {
      repository: {
        findVoiceSessionForOwner: vi.fn().mockResolvedValue({
          id: "session-1",
          conversationId: "conversation-1",
          status: "active",
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
