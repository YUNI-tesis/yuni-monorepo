import { describe, expect, it, vi } from "vitest";
import { AvatarProviderError, type AvatarOption } from "@yuni/avatars";
import type { CreateAvatarAgentInput } from "@yuni/domain";
import { ElevenLabsProviderError } from "@yuni/voice";
import type { PublicUser, UserWithPassword } from "./domains/auth/repository";
import type { AvatarAgentRecord } from "./domains/avatars/repository";
import { createApp, type AppDependencies } from "./app";

function createUser(overrides: Partial<UserWithPassword> = {}): UserWithPassword {
  const now = new Date("2026-06-08T00:00:00.000Z");

  return {
    id: "user-1",
    email: "demo@yuni.local",
    name: "Demo",
    imageUrl: null,
    passwordHash: "hash:demo-password",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function publicUser(user: UserWithPassword): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    imageUrl: user.imageUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function avatarInput(overrides: Partial<CreateAvatarAgentInput> = {}): CreateAvatarAgentInput {
  return {
    name: "Tutor Demo",
    description: "Avatar de prueba",
    instructions: "Responde claro.",
    context: "Contexto de prueba.",
    voiceConfig: { provider: "openai", voiceId: "alloy", speakingRate: 1 },
    liveAvatarConfig: { provider: "liveavatar", avatarId: "liveavatar-1", mode: "lite", sandbox: true },
    status: "draft",
    ...overrides,
  };
}

function avatarRecord(ownerId: string, input: CreateAvatarAgentInput): AvatarAgentRecord {
  const now = new Date("2026-06-08T00:00:00.000Z");

  return {
    id: "avatar-1",
    ownerId,
    name: input.name,
    description: input.description,
    instructions: input.instructions,
    context: input.context,
    voiceConfig: input.voiceConfig,
    liveAvatarConfig: input.liveAvatarConfig,
    agentProvider: "elevenlabs_agents",
    providerAgentId: null,
    providerSyncStatus: "not_synced",
    providerSyncError: null,
    providerSyncedAt: null,
    providerSyncFingerprint: null,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  };
}

function createTestDependencies(
  options: {
    users?: UserWithPassword[];
    providerError?: Error;
    liveAvatarError?: Error;
    generatedTitle?: string | null;
    titleError?: Error;
    finalizeFailures?: number;
    activationError?: Error;
  } = {}
) {
  const users = new Map((options.users ?? [createUser()]).map((user) => [user.email, user]));
  const avatars = new Map<string, AvatarAgentRecord>();
  const conversations = new Map<
    string,
    {
      id: string;
      ownerId: string;
      avatarAgentId: string;
      accessGrantId?: string | null;
      participantEmail?: string | null;
      title: string | null;
      mode: "text" | "voice";
      status: "active" | "ended";
      visibility: "private";
      lastMessageAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }
  >();
  const accessGrants = new Map<
    string,
    {
      id: string;
      avatarAgentId: string;
      ownerId: string;
      participantEmail: string;
      participantUserId: string | null;
      status: "active" | "revoked";
    }
  >();
  const realtimeSessions = new Map<
    string,
    {
      id: string;
      conversationId: string;
      avatarAgentId: string;
      providerSessionId: string | null;
      status: string;
      activatedAt: Date | null;
      endedAt: Date | null;
      errorMessage: string | null;
    }
  >();
  const messages: Array<{
    id: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }> = [];
  const providerSyncCalls: string[] = [];
  const stopProviderSession = vi.fn(async () => undefined);
  let remainingFinalizeFailures = options.finalizeFailures ?? 0;
  const initialAvatar = avatarRecord("user-1", avatarInput());
  avatars.set(initialAvatar.id, initialAvatar);

  const liveAvatarProvider = {
    name: "liveavatar" as const,
    async listAvatars(): Promise<AvatarOption[]> {
      return [];
    },
    async createLiteSessionToken() {
      if (options.liveAvatarError) {
        throw options.liveAvatarError;
      }

      return {
        sessionToken: "liveavatar-session-token",
        sessionId: "liveavatar-session-id",
      };
    },
    stopSession: stopProviderSession,
  };
  const avatarRepository: AppDependencies["avatars"]["repository"] = {
    async create(ownerId, input) {
      const avatar = avatarRecord(ownerId, input);
      avatars.set(avatar.id, avatar);

      return avatar;
    },
    async listByOwner(ownerId) {
      return Array.from(avatars.values()).filter((avatar) => avatar.ownerId === ownerId);
    },
    async findByIdForOwner(ownerId, avatarId) {
      const avatar = avatars.get(avatarId);

      return avatar?.ownerId === ownerId ? avatar : null;
    },
    async findAccessibleForUser(userId, avatarId) {
      const avatar = avatars.get(avatarId);

      if (!avatar) return null;
      if (avatar.ownerId === userId) return { type: "owner" as const, avatar };

      const accessGrant = Array.from(accessGrants.values()).find(
        (grant) =>
          grant.avatarAgentId === avatarId && grant.participantUserId === userId && grant.status === "active"
      );

      return avatar.status === "active" && accessGrant
        ? { type: "shared" as const, avatar, accessGrant }
        : null;
    },
    async updateProviderSync(ownerId, avatarId, input) {
      const avatar = avatars.get(avatarId);

      if (!avatar || avatar.ownerId !== ownerId) {
        throw new Error("not owned");
      }

      const updated: AvatarAgentRecord = {
        ...avatar,
        ...input,
        providerSyncError: input.providerSyncError ?? null,
        providerSyncedAt: input.providerSyncedAt ?? null,
        updatedAt: new Date("2026-06-08T00:01:00.000Z"),
      };
      avatars.set(avatarId, updated);

      return updated;
    },
    async updateForOwner() {
      throw new Error("not used");
    },
    async deleteForOwner() {
      throw new Error("not used");
    },
  };

  const dependencies: AppDependencies = {
    auth: {
      passwords: {
        async hash(password) {
          return `hash:${password}`;
        },
        async verify(password, passwordHash) {
          return passwordHash === `hash:${password}`;
        },
      },
      repository: {
        async createWithPassword(input) {
          const user = createUser({
            id: `user-${users.size + 1}`,
            email: input.email,
            name: input.name ?? null,
            passwordHash: input.passwordHash,
          });
          users.set(user.email, user);

          return publicUser(user);
        },
        async findByEmail(email) {
          return users.get(email) ?? null;
        },
        async findPublicById(userId) {
          const user = Array.from(users.values()).find((candidate) => candidate.id === userId);

          return user ? publicUser(user) : null;
        },
        async existsByEmail(email) {
          return users.has(email);
        },
      },
    },
    avatars: {
      liveAvatarConfig: { mode: "lite", sandbox: true },
      repository: avatarRepository,
      avatarProvider: liveAvatarProvider,
    },
    liveAvatar: {
      provider: liveAvatarProvider,
    },
    voiceSessions: {
      avatarsRepository: avatarRepository,
      conversationsRepository: {
        async createPrivateForParticipant(input) {
          const id = `conversation-${conversations.size + 1}`;
          const now = new Date("2026-06-08T00:00:00.000Z");
          conversations.set(id, {
            id,
            ownerId: input.ownerId,
            avatarAgentId: input.avatarAgentId,
            accessGrantId: input.accessGrantId ?? null,
            participantEmail: input.participantEmail ?? null,
            title: null,
            mode: "voice",
            status: "active",
            visibility: "private",
            lastMessageAt: null,
            createdAt: now,
            updatedAt: now,
          });

          return { id };
        },
        async markEnded(id) {
          const conversation = conversations.get(id);
          if (conversation) {
            conversation.status = "ended";
            conversation.updatedAt = new Date("2026-06-08T00:02:00.000Z");
          }
        },
        async updateTitle(id, title) {
          const conversation = conversations.get(id);
          if (conversation) {
            conversation.title = title;
            conversation.updatedAt = new Date("2026-06-08T00:02:01.000Z");
          }
        },
      },
      realtimeSessionsRepository: {
        async create(input) {
          const id = `realtime-${realtimeSessions.size + 1}`;
          realtimeSessions.set(id, {
            id,
            conversationId: input.conversationId,
            avatarAgentId: input.avatarAgentId,
            providerSessionId: null,
            status: "connecting",
            activatedAt: null,
            endedAt: null,
            errorMessage: null,
          });

          return { id };
        },
        async findPrivateForParticipant(participantUserId, realtimeSessionId) {
          const realtimeSession = realtimeSessions.get(realtimeSessionId);
          const conversation = realtimeSession ? conversations.get(realtimeSession.conversationId) : null;

          if (!realtimeSession || !conversation || conversation.ownerId !== participantUserId) {
            return null;
          }

          return { ...realtimeSession, conversation };
        },
        async markPrepared(id, providerSessionId) {
          if (options.activationError) throw options.activationError;
          const realtimeSession = realtimeSessions.get(id);
          if (!realtimeSession) throw new Error("missing realtime session");
          realtimeSession.providerSessionId = providerSessionId ?? null;

          return realtimeSession;
        },
        async markActive(id) {
          const realtimeSession = realtimeSessions.get(id);
          if (!realtimeSession || !["connecting", "active"].includes(realtimeSession.status)) return null;
          if (realtimeSession.status === "connecting") {
            realtimeSession.status = "active";
            realtimeSession.activatedAt = new Date("2026-06-08T00:00:30.000Z");
          }
          return realtimeSession;
        },
        async markEnded(id) {
          const realtimeSession = realtimeSessions.get(id);
          if (!realtimeSession) throw new Error("missing realtime session");
          realtimeSession.status = "ended";
          realtimeSession.endedAt = new Date("2026-06-08T00:02:00.000Z");

          return realtimeSession;
        },
        async finalizePrivate(input) {
          const realtimeSession = realtimeSessions.get(input.realtimeSessionId);
          const conversation = conversations.get(input.conversationId);
          if (!realtimeSession || !conversation) return null;
          if (realtimeSession.status === "ended") {
            return { session: realtimeSession, finalized: false };
          }
          if (remainingFinalizeFailures > 0) {
            remainingFinalizeFailures -= 1;
            throw new Error("temporary finalize failure");
          }

          const endedAt = new Date("2026-06-08T00:02:00.000Z");
          for (const entry of input.transcript) {
            const createdAt = new Date(endedAt.getTime() + messages.length);
            messages.push({
              id: `message-${messages.length + 1}`,
              conversationId: input.conversationId,
              role: entry.role,
              content: entry.content,
              metadata: { source: "liveavatar_sdk" },
              createdAt,
            });
            conversation.lastMessageAt = createdAt;
          }
          conversation.status = "ended";
          conversation.title = input.title;
          conversation.updatedAt = endedAt;
          realtimeSession.status = "ended";
          realtimeSession.endedAt = endedAt;

          return { session: realtimeSession, finalized: true };
        },
        async markErrored(id, errorMessage) {
          const realtimeSession = realtimeSessions.get(id);
          if (!realtimeSession) throw new Error(errorMessage);
          realtimeSession.status = "errored";
          realtimeSession.endedAt = new Date("2026-06-08T00:02:00.000Z");
          realtimeSession.errorMessage = errorMessage;
          return true;
        },
        async failUnconfirmedOwnerStart(id, conversationId, errorMessage) {
          const realtimeSession = realtimeSessions.get(id);
          if (!realtimeSession || realtimeSession.status !== "connecting") return false;
          realtimeSession.status = "errored";
          realtimeSession.endedAt = new Date("2026-06-08T00:02:00.000Z");
          realtimeSession.errorMessage = errorMessage;
          if (conversationId) {
            const conversation = conversations.get(conversationId);
            if (conversation) {
              conversation.status = "ended";
              conversation.updatedAt = new Date("2026-06-08T00:02:00.000Z");
            }
          }
          return true;
        },
        async markProviderStopped() {},
        async expireSharedIfActive(id, conversationId) {
          const realtimeSession = realtimeSessions.get(id);
          if (realtimeSession && realtimeSession.status !== "ended") {
            realtimeSession.status = "ended";
            realtimeSession.endedAt = new Date("2026-06-08T00:02:00.000Z");
          }
          if (conversationId) {
            const conversation = conversations.get(conversationId);
            if (conversation) {
              conversation.status = "ended";
              conversation.updatedAt = new Date("2026-06-08T00:02:00.000Z");
            }
          }
        },
      },
      liveAvatarProvider,
      elevenLabsAgentProvider: {
        async syncAvatarAgent(input) {
          providerSyncCalls.push(input.id);
          if (options.providerError) {
            throw options.providerError;
          }

          return {
            providerAgentId: "agent-1",
            providerSyncFingerprint: "fingerprint",
            synced: true,
          };
        },
      },
      conversationTitleGenerator: {
        async generateTitle() {
          if (options.titleError) {
            throw options.titleError;
          }

          return options.generatedTitle === undefined ? "Saludo inicial" : options.generatedTitle;
        },
      },
    },
    conversations: {
      avatarsRepository: avatarRepository,
      conversationsRepository: {
        async createPrivateForParticipant(input) {
          const id = `conversation-${conversations.size + 1}`;
          const now = new Date("2026-06-08T00:00:00.000Z");
          const conversation = {
            id,
            ownerId: input.ownerId,
            avatarAgentId: input.avatarAgentId,
            accessGrantId: input.accessGrantId ?? null,
            participantEmail: input.participantEmail ?? null,
            title: null,
            mode: input.mode,
            status: "active" as const,
            visibility: "private" as const,
            lastMessageAt: null,
            createdAt: now,
            updatedAt: now,
          };
          conversations.set(id, conversation);
          return conversation;
        },
        async listPrivateForAccess(ownerId, avatarAgentId, accessGrantId) {
          return Array.from(conversations.values())
            .filter(
              (conversation) =>
                conversation.ownerId === ownerId &&
                conversation.avatarAgentId === avatarAgentId &&
                conversation.accessGrantId === accessGrantId &&
                conversation.visibility === "private"
            )
            .sort((left, right) => {
              const leftTime = (left.lastMessageAt ?? left.createdAt).getTime();
              const rightTime = (right.lastMessageAt ?? right.createdAt).getTime();

              return rightTime - leftTime || right.createdAt.getTime() - left.createdAt.getTime();
            });
        },
        async findLatestPrivateForAccess(ownerId, avatarAgentId, accessGrantId) {
          return (
            Array.from(conversations.values())
              .filter(
                (conversation) =>
                  conversation.ownerId === ownerId &&
                  conversation.avatarAgentId === avatarAgentId &&
                  conversation.accessGrantId === accessGrantId &&
                  conversation.visibility === "private"
              )
              .sort((left, right) => {
                const leftTime = (left.lastMessageAt ?? left.createdAt).getTime();
                const rightTime = (right.lastMessageAt ?? right.createdAt).getTime();
                return rightTime - leftTime || right.createdAt.getTime() - left.createdAt.getTime();
              })[0] ?? null
          );
        },
        async findPrivateIdentityById(conversationId) {
          const conversation = conversations.get(conversationId);
          return conversation
            ? {
                id: conversation.id,
                ownerId: conversation.ownerId,
                avatarAgentId: conversation.avatarAgentId,
                accessGrantId: conversation.accessGrantId ?? null,
              }
            : null;
        },
        async findPrivateByIdForAccess(ownerId, conversationId, accessGrantId) {
          const conversation = conversations.get(conversationId);

          if (
            !conversation ||
            conversation.ownerId !== ownerId ||
            conversation.accessGrantId !== accessGrantId ||
            conversation.visibility !== "private"
          ) {
            return null;
          }

          return {
            ...conversation,
            messages: messages
              .filter((message) => message.conversationId === conversationId)
              .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
          };
        },
      },
    },
  };

  return {
    dependencies,
    avatars,
    accessGrants,
    conversations,
    realtimeSessions,
    messages,
    providerSyncCalls,
    stopProviderSession,
  };
}

function enableSharedExternalSessions(state: ReturnType<typeof createTestDependencies>) {
  const voiceDependencies = state.dependencies.voiceSessions!;
  voiceDependencies.externalSessions = {
    policyService: {
      reservePublic: vi.fn(async () => null),
      reserveShared: vi.fn(async ({ targetId, avatarId, participantUserId }) => {
        const grant = state.accessGrants.get(targetId);
        if (
          !grant ||
          grant.avatarAgentId !== avatarId ||
          grant.participantUserId !== participantUserId ||
          grant.status !== "active"
        ) {
          return null;
        }

        const conversation = await voiceDependencies.conversationsRepository.createPrivateForParticipant({
          ownerId: participantUserId,
          avatarAgentId: avatarId,
          accessGrantId: grant.id,
          participantEmail: grant.participantEmail,
          mode: "voice",
        });
        const expiresAt = new Date("2026-06-08T01:00:00.000Z");
        const realtimeSession = await voiceDependencies.realtimeSessionsRepository.create({
          avatarAgentId: avatarId,
          conversationId: conversation.id,
          accessGrantId: grant.id,
          expiresAt,
        });
        return { conversation, realtimeSession, expiresAt };
      }),
    } as never,
    policyRepository: {} as never,
    rateLimiter: { consume: vi.fn(() => ({ allowed: true as const })) },
    providerTokenProtector: {
      encrypt: vi.fn((token: string) => `encrypted:${token}`),
      decrypt: vi.fn((token: string) => token.replace("encrypted:", "")),
    },
    rateLimits: { startIpTarget: 60, startParticipantTarget: 20, startAvatar: 200 },
    schedule: vi.fn(),
  };
}

async function login(
  app: ReturnType<typeof createApp>,
  email = "demo@yuni.local",
  password = "demo-password"
) {
  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("@yuni/api voice sessions", () => {
  it("rejects anonymous voice session requests", async () => {
    const { dependencies } = createTestDependencies();
    const app = createApp(dependencies);
    const response = await app.request("/avatars/avatar-1/voice-sessions", { method: "POST" });

    expect(response.status).toBe(401);
  });

  it("starts a private voice session with synced ElevenLabs agent and LiveAvatar token", async () => {
    const state = createTestDependencies();
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    const response = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const body = (await json(response)) as {
      voiceSession: {
        conversationId: string;
        realtimeSessionId: string;
        sessionToken: string;
        expiresAt: string | null;
        apiKey?: string;
      };
    };

    expect(response.status).toBe(201);
    expect(body.voiceSession).toMatchObject({
      conversationId: "conversation-1",
      realtimeSessionId: "realtime-1",
      sessionToken: "liveavatar-session-token",
      expiresAt: null,
    });
    expect(body.voiceSession.apiKey).toBeUndefined();
    expect(JSON.stringify(body.voiceSession)).not.toMatch(/providerAgentId|providerSessionId|"sessionId"/);
    expect(state.avatars.get("avatar-1")?.providerSyncStatus).toBe("synced");
    expect(state.realtimeSessions.get("realtime-1")).toMatchObject({
      status: "connecting",
      activatedAt: null,
      providerSessionId: "liveavatar-session-id",
    });

    const confirmResponse = await app.request("/voice-sessions/realtime-1/started", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(confirmResponse.status).toBe(200);
    expect(state.realtimeSessions.get("realtime-1")).toMatchObject({
      status: "active",
      activatedAt: new Date("2026-06-08T00:00:30.000Z"),
    });

    const repeatedConfirmation = await app.request("/voice-sessions/realtime-1/started", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(repeatedConfirmation.status).toBe(200);
  });

  it("records a client SDK startup failure as an error instead of a normal end", async () => {
    const state = createTestDependencies();
    const app = createApp(state.dependencies);
    const cookie = await login(app);

    const startResponse = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(startResponse.status).toBe(201);

    const failedResponse = await app.request("/voice-sessions/realtime-1/start-failed", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(failedResponse.status).toBe(200);
    expect(await json(failedResponse)).toMatchObject({
      voiceSession: { id: "realtime-1", status: "errored" },
    });
    expect(state.realtimeSessions.get("realtime-1")).toMatchObject({
      status: "errored",
      activatedAt: null,
      errorMessage: expect.any(String),
    });
    expect(state.conversations.get("conversation-1")?.status).toBe("ended");

    const repeatedFailure = await app.request("/voice-sessions/realtime-1/start-failed", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(repeatedFailure.status).toBe(200);

    await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    await app.request("/voice-sessions/realtime-2/started", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const activatedAt = state.realtimeSessions.get("realtime-2")?.activatedAt;

    const failureAfterActivation = await app.request("/voice-sessions/realtime-2/start-failed", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(failureAfterActivation.status).toBe(200);
    expect(state.realtimeSessions.get("realtime-2")).toMatchObject({
      status: "errored",
      activatedAt,
    });
  });

  it("keeps the owner unlimited while a new context sync uses the last usable provider version", async () => {
    const state = createTestDependencies();
    const avatar = state.avatars.get("avatar-1")!;
    state.avatars.set("avatar-1", {
      ...avatar,
      providerAgentId: "agent-previous",
      providerSyncStatus: "syncing",
      providerLastUsableAt: new Date("2026-06-08T00:00:00.000Z"),
    });
    const reservePublic = vi.fn();
    const reserveShared = vi.fn();
    state.dependencies.voiceSessions!.backgroundSyncEnabled = true;
    state.dependencies.voiceSessions!.externalSessions = {
      policyService: { reservePublic, reserveShared } as never,
      policyRepository: {} as never,
      rateLimiter: { consume: vi.fn(() => ({ allowed: true as const })) },
      providerTokenProtector: {
        encrypt: vi.fn((token: string) => token),
        decrypt: vi.fn((token: string) => token),
      },
      rateLimits: { startIpTarget: 60, startParticipantTarget: 20, startAvatar: 200 },
    };
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    const response = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const body = (await json(response)) as { voiceSession: { expiresAt: string | null } };

    expect(response.status).toBe(201);
    expect(body.voiceSession.expiresAt).toBeNull();
    expect(state.providerSyncCalls).toEqual([]);
    expect(reservePublic).not.toHaveBeenCalled();
    expect(reserveShared).not.toHaveBeenCalled();
  });

  it("does not start a voice session for an avatar owned by another user", async () => {
    const state = createTestDependencies({
      users: [createUser({ id: "user-2", email: "demo@yuni.local" })],
    });
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    const response = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(404);
  });

  it.each([
    ["syncing without a usable version", "syncing", "processing"],
    ["failed without a usable version", "failed", "unavailable"],
    ["synced without a provider agent", "synced", "unavailable"],
  ] as const)("reports owner voice as %s", async (_case, providerSyncStatus, expected) => {
    const state = createTestDependencies();
    const avatar = state.avatars.get("avatar-1")!;
    state.avatars.set("avatar-1", {
      ...avatar,
      status: "active",
      providerSyncStatus,
      providerAgentId: null,
      providerLastUsableAt: null,
    });
    const app = createApp(state.dependencies);
    const cookie = await login(app);

    const response = await app.request("/avatars/avatar-1/interaction-context", {
      headers: { Cookie: cookie },
    });
    const body = (await json(response)) as {
      interactionContext: { voiceAvailability: string };
    };

    expect(response.status).toBe(200);
    expect(body.interactionContext.voiceAvailability).toBe(expected);
  });

  it("exposes a safe interaction context and starts an attributed shared voice session", async () => {
    const participant = createUser({
      id: "user-2",
      email: "participant@yuni.local",
      name: "Participant",
    });
    const state = createTestDependencies({ users: [createUser(), participant] });
    const avatar = state.avatars.get("avatar-1")!;
    state.avatars.set("avatar-1", {
      ...avatar,
      status: "active",
      providerSyncStatus: "synced",
      providerAgentId: "agent-shared",
    });
    state.accessGrants.set("grant-1", {
      id: "grant-1",
      avatarAgentId: "avatar-1",
      ownerId: "user-1",
      participantEmail: participant.email,
      participantUserId: participant.id,
      status: "active",
    });
    enableSharedExternalSessions(state);
    const app = createApp(state.dependencies);
    const participantCookie = await login(app, participant.email);

    const contextResponse = await app.request("/avatars/avatar-1/interaction-context", {
      headers: { Cookie: participantCookie },
    });
    const contextBody = (await json(contextResponse)) as {
      interactionContext: Record<string, unknown> & { access: { type: string } };
    };

    expect(contextResponse.status).toBe(200);
    expect(contextBody.interactionContext).toMatchObject({
      avatar: { id: "avatar-1", name: "Tutor Demo", status: "active" },
      access: {
        type: "shared",
        canInteract: true,
        limits: {
          maxSessionDurationSeconds: null,
          maxSessionsPer24Hours: null,
        },
      },
      contextStatus: "ready",
      voiceAvailability: "ready",
    });
    expect(JSON.stringify(contextBody)).not.toMatch(
      /instructions|voiceConfig|liveAvatarConfig|providerAgentId|providerSyncFingerprint/
    );

    const startResponse = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: participantCookie },
    });

    expect(startResponse.status).toBe(201);
    expect(state.providerSyncCalls).toEqual([]);
    expect(state.conversations.get("conversation-1")).toMatchObject({
      ownerId: participant.id,
      accessGrantId: "grant-1",
      participantEmail: participant.email,
      mode: "voice",
    });
    expect(state.realtimeSessions.get("realtime-1")?.activatedAt).toBeNull();

    expect(
      (
        await app.request("/voice-sessions/realtime-1/started", {
          method: "POST",
          headers: { Cookie: participantCookie },
        })
      ).status
    ).toBe(200);
    expect(state.realtimeSessions.get("realtime-1")?.activatedAt).toEqual(
      new Date("2026-06-08T00:00:30.000Z")
    );
  });

  it("fails closed when shared session protections are not configured", async () => {
    const participant = createUser({ id: "user-2", email: "participant@yuni.local" });
    const state = createTestDependencies({ users: [createUser(), participant] });
    const avatar = state.avatars.get("avatar-1")!;
    state.avatars.set("avatar-1", {
      ...avatar,
      status: "active",
      providerSyncStatus: "synced",
      providerAgentId: "agent-shared",
    });
    state.accessGrants.set("grant-1", {
      id: "grant-1",
      avatarAgentId: "avatar-1",
      ownerId: "user-1",
      participantEmail: participant.email,
      participantUserId: participant.id,
      status: "active",
    });
    const app = createApp(state.dependencies);
    const participantCookie = await login(app, participant.email);

    const response = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: participantCookie },
    });

    expect(response.status).toBe(503);
    expect(state.conversations.size).toBe(0);
    expect(state.realtimeSessions.size).toBe(0);
  });

  it("keeps shared interaction available after a failed sync when a previous version is usable", async () => {
    const participant = createUser({
      id: "user-2",
      email: "participant@yuni.local",
      name: "Participant",
    });
    const state = createTestDependencies({ users: [createUser(), participant] });
    const avatar = state.avatars.get("avatar-1")!;
    state.avatars.set("avatar-1", {
      ...avatar,
      status: "active",
      providerSyncStatus: "failed",
      providerAgentId: "agent-previous",
      providerLastUsableAt: new Date("2026-08-16T12:00:00.000Z"),
    });
    state.accessGrants.set("grant-1", {
      id: "grant-1",
      avatarAgentId: "avatar-1",
      ownerId: "user-1",
      participantEmail: participant.email,
      participantUserId: participant.id,
      status: "active",
    });
    const app = createApp(state.dependencies);
    const participantCookie = await login(app, participant.email);

    const response = await app.request("/avatars/avatar-1/interaction-context", {
      headers: { Cookie: participantCookie },
    });
    const body = (await json(response)) as {
      interactionContext: { contextStatus: string; voiceAvailability: string };
    };

    expect(response.status).toBe(200);
    expect(body.interactionContext).toMatchObject({
      contextStatus: "failed",
      voiceAvailability: "ready",
    });
  });

  it("blocks an unready shared avatar without syncing or creating session records", async () => {
    const participant = createUser({ id: "user-2", email: "participant@yuni.local" });
    const state = createTestDependencies({ users: [createUser(), participant] });
    const avatar = state.avatars.get("avatar-1")!;
    state.avatars.set("avatar-1", { ...avatar, status: "active" });
    state.accessGrants.set("grant-1", {
      id: "grant-1",
      avatarAgentId: "avatar-1",
      ownerId: "user-1",
      participantEmail: participant.email,
      participantUserId: participant.id,
      status: "active",
    });
    const app = createApp(state.dependencies);
    const cookie = await login(app, participant.email);
    const response = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const body = (await json(response)) as { error: { code: string; reason: string } };

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      reason: "AVATAR_NOT_READY",
    });
    expect(state.providerSyncCalls).toEqual([]);
    expect(state.conversations.size).toBe(0);
    expect(state.realtimeSessions.size).toBe(0);
  });

  it("isolates shared conversation APIs and restores history when the same grant is reactivated", async () => {
    const participant = createUser({ id: "user-2", email: "participant@yuni.local" });
    const state = createTestDependencies({ users: [createUser(), participant] });
    const avatar = state.avatars.get("avatar-1")!;
    state.avatars.set("avatar-1", {
      ...avatar,
      status: "active",
      providerSyncStatus: "synced",
      providerAgentId: "agent-shared",
    });
    const grant = {
      id: "grant-1",
      avatarAgentId: "avatar-1",
      ownerId: "user-1",
      participantEmail: participant.email,
      participantUserId: participant.id,
      status: "active" as const,
    };
    state.accessGrants.set(grant.id, grant);
    const app = createApp(state.dependencies);
    const participantCookie = await login(app, participant.email);
    const ownerCookie = await login(app);

    const createResponse = await app.request("/avatars/avatar-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: participantCookie },
      body: JSON.stringify({ mode: "text" }),
    });
    const latestResponse = await app.request("/avatars/avatar-1/conversations/latest", {
      headers: { Cookie: participantCookie },
    });
    const latestBody = (await json(latestResponse)) as { conversation: { id: string } | null };
    const ownerListResponse = await app.request("/avatars/avatar-1/conversations", {
      headers: { Cookie: ownerCookie },
    });
    const ownerListBody = (await json(ownerListResponse)) as { conversations: unknown[] };

    expect(createResponse.status).toBe(201);
    expect(latestResponse.status).toBe(200);
    expect(latestBody.conversation?.id).toBe("conversation-1");
    expect(ownerListBody.conversations).toEqual([]);

    state.accessGrants.set(grant.id, { ...grant, status: "revoked" });
    expect(
      (
        await app.request("/avatars/avatar-1/conversations", {
          headers: { Cookie: participantCookie },
        })
      ).status
    ).toBe(404);
    expect(
      (
        await app.request("/conversations/conversation-1", {
          headers: { Cookie: participantCookie },
        })
      ).status
    ).toBe(404);

    state.accessGrants.set(grant.id, grant);
    const restored = await app.request("/conversations/conversation-1", {
      headers: { Cookie: participantCookie },
    });
    expect(restored.status).toBe(200);
  });

  it("allows a participant to finish an in-flight call after grant revocation", async () => {
    const participant = createUser({ id: "user-2", email: "participant@yuni.local" });
    const state = createTestDependencies({ users: [createUser(), participant] });
    const avatar = state.avatars.get("avatar-1")!;
    state.avatars.set("avatar-1", {
      ...avatar,
      status: "active",
      providerSyncStatus: "synced",
      providerAgentId: "agent-shared",
    });
    state.accessGrants.set("grant-1", {
      id: "grant-1",
      avatarAgentId: "avatar-1",
      ownerId: "user-1",
      participantEmail: participant.email,
      participantUserId: participant.id,
      status: "active",
    });
    enableSharedExternalSessions(state);
    const app = createApp(state.dependencies);
    const cookie = await login(app, participant.email);
    await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    state.accessGrants.set("grant-1", {
      ...state.accessGrants.get("grant-1")!,
      status: "revoked",
    });
    const endResponse = await app.request("/voice-sessions/realtime-1/end", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ transcript: [{ role: "user", content: "Hola" }] }),
    });

    expect(endResponse.status).toBe(200);
    expect(state.messages).toEqual([expect.objectContaining({ content: "Hola" })]);
    expect(
      (
        await app.request("/avatars/avatar-1/voice-sessions", {
          method: "POST",
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(404);
  });

  it("returns provider errors and stores sync failure state", async () => {
    const state = createTestDependencies({ providerError: new ElevenLabsProviderError("provider exploded") });
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    const response = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(502);
    expect(state.avatars.get("avatar-1")).toMatchObject({
      providerSyncStatus: "failed",
      providerSyncError: "provider exploded",
    });
  });

  it("returns LiveAvatar session errors without provider details", async () => {
    const state = createTestDependencies({
      liveAvatarError: new AvatarProviderError("Live Avatar returned code 4000: Invalid secret_id"),
    });
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    const response = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const body = (await json(response)) as { error: { code: string; message: string } };

    expect(response.status).toBe(502);
    expect(body.error).toEqual({
      code: "BAD_GATEWAY",
      message: "No pudimos iniciar la llamada.",
    });
    expect(state.realtimeSessions.get("realtime-1")?.status).toBe("errored");
    expect(state.realtimeSessions.get("realtime-1")?.errorMessage).toBe(
      "External voice session start failed"
    );
    expect(state.conversations.get("conversation-1")?.status).toBe("ended");
  });

  it("stops an owner provider session when database activation fails", async () => {
    const state = createTestDependencies({ activationError: new Error("temporary activation failure") });
    const app = createApp(state.dependencies);
    const cookie = await login(app);

    const response = await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(500);
    expect(state.stopProviderSession).toHaveBeenCalledWith("liveavatar-session-token");
    expect(state.realtimeSessions.get("realtime-1")?.status).toBe("errored");
  });

  it("persists transcript entries when ending a private voice session", async () => {
    const state = createTestDependencies();
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    const response = await app.request("/voice-sessions/realtime-1/end", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        transcript: [
          { role: "user", content: "Hola" },
          { role: "assistant", content: "Hola, soy Tutor Demo." },
        ],
      }),
    });
    const body = (await json(response)) as { voiceSession: { status: string; endedAt: string | null } };

    expect(response.status).toBe(200);
    expect(body.voiceSession.status).toBe("ended");
    expect(body.voiceSession.endedAt).toBe("2026-06-08T00:02:00.000Z");
    expect(
      state.messages.map(({ conversationId, role, content }) => ({ conversationId, role, content }))
    ).toEqual([
      { conversationId: "conversation-1", role: "user", content: "Hola" },
      { conversationId: "conversation-1", role: "assistant", content: "Hola, soy Tutor Demo." },
    ]);
    expect(state.conversations.get("conversation-1")?.status).toBe("ended");
    expect(state.conversations.get("conversation-1")?.title).toBe("Saludo inicial");
  });

  it("accepts the text/plain JSON body used by authenticated unload beacons", async () => {
    const state = createTestDependencies();
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    const response = await app.request("/voice-sessions/realtime-1/end", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8", Cookie: cookie },
      body: JSON.stringify({ transcript: [{ role: "user", content: "Cierre desde beacon" }] }),
    });

    expect(response.status).toBe(200);
    expect(state.messages).toEqual([expect.objectContaining({ content: "Cierre desde beacon" })]);
  });

  it("retries an atomic private finalization without duplicating transcript entries", async () => {
    const state = createTestDependencies({ finalizeFailures: 1 });
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(
      (
        await app.request("/voice-sessions/realtime-1/started", {
          method: "POST",
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(200);
    const request = () =>
      app.request("/voice-sessions/realtime-1/end", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ transcript: [{ role: "user", content: "Guardar una sola vez" }] }),
      });

    expect((await request()).status).toBe(500);
    expect(state.messages).toHaveLength(0);
    expect(state.realtimeSessions.get("realtime-1")?.status).toBe("active");

    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect(state.messages.map((message) => message.content)).toEqual(["Guardar una sola vez"]);
  });

  it("saves a fallback title when OpenAI title generation fails", async () => {
    const state = createTestDependencies({ titleError: new Error("OpenAI failed") });
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    const response = await app.request("/voice-sessions/realtime-1/end", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        transcript: [{ role: "user", content: "Necesito practicar derivadas para el parcial." }],
      }),
    });

    expect(response.status).toBe(200);
    expect(state.conversations.get("conversation-1")?.title).toBe(
      "Necesito practicar derivadas para el parcial"
    );
  });

  it("lists private voice conversations for an owned avatar", async () => {
    const state = createTestDependencies({ generatedTitle: "Practica de derivadas" });
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    await app.request("/voice-sessions/realtime-1/end", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        transcript: [{ role: "user", content: "Necesito practicar derivadas." }],
      }),
    });

    const response = await app.request("/avatars/avatar-1/conversations", {
      headers: { Cookie: cookie },
    });
    const body = (await json(response)) as {
      conversations: Array<{
        id: string;
        title: string | null;
        status: string;
        lastMessageAt: string | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.conversations).toEqual([
      expect.objectContaining({
        id: "conversation-1",
        title: "Practica de derivadas",
        status: "ended",
        lastMessageAt: "2026-06-08T00:02:00.000Z",
      }),
    ]);
  });

  it("returns literal messages for a selected private conversation", async () => {
    const state = createTestDependencies({ generatedTitle: "Practica de derivadas" });
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    await app.request("/avatars/avatar-1/voice-sessions", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    await app.request("/voice-sessions/realtime-1/end", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        transcript: [
          { role: "user", content: "Hola" },
          { role: "assistant", content: "Hola, soy Tutor Demo." },
        ],
      }),
    });

    const response = await app.request("/conversations/conversation-1", {
      headers: { Cookie: cookie },
    });
    const body = (await json(response)) as {
      conversation: { title: string | null; messages: Array<{ role: string; content: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.conversation.title).toBe("Practica de derivadas");
    expect(body.conversation.messages).toEqual([
      expect.objectContaining({ role: "user", content: "Hola" }),
      expect.objectContaining({ role: "assistant", content: "Hola, soy Tutor Demo." }),
    ]);
  });

  it("does not expose private conversations owned by another user", async () => {
    const state = createTestDependencies();
    const app = createApp(state.dependencies);
    const cookie = await login(app);
    const now = new Date("2026-06-08T00:00:00.000Z");

    state.conversations.set("conversation-foreign", {
      id: "conversation-foreign",
      ownerId: "user-2",
      avatarAgentId: "avatar-1",
      title: "Privada",
      mode: "voice",
      status: "ended",
      visibility: "private",
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const response = await app.request("/conversations/conversation-foreign", {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(404);
  });
});
