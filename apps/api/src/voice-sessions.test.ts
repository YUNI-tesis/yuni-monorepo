import { describe, expect, it } from "vitest";
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

function createTestDependencies(options: {
  users?: UserWithPassword[];
  providerError?: Error;
  liveAvatarError?: Error;
} = {}) {
  const users = new Map((options.users ?? [createUser()]).map((user) => [user.email, user]));
  const avatars = new Map<string, AvatarAgentRecord>();
  const conversations = new Map<string, { id: string; ownerId: string; avatarAgentId: string; status: string }>();
  const realtimeSessions = new Map<
    string,
    {
      id: string;
      conversationId: string;
      avatarAgentId: string;
      providerSessionId: string | null;
      status: string;
      endedAt: Date | null;
    }
  >();
  const messages: Array<{ conversationId: string; role: string; content: string }> = [];
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
        async createPrivate(ownerId, avatarAgentId) {
          const id = `conversation-${conversations.size + 1}`;
          conversations.set(id, { id, ownerId, avatarAgentId, status: "active" });

          return { id };
        },
        async markEnded(id) {
          const conversation = conversations.get(id);
          if (conversation) {
            conversation.status = "ended";
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
            endedAt: null,
          });

          return { id };
        },
        async findPrivateForOwner(ownerId, realtimeSessionId) {
          const realtimeSession = realtimeSessions.get(realtimeSessionId);
          const conversation = realtimeSession ? conversations.get(realtimeSession.conversationId) : null;

          if (!realtimeSession || !conversation || conversation.ownerId !== ownerId) {
            return null;
          }

          return { ...realtimeSession, conversation };
        },
        async markActive(id, providerSessionId) {
          const realtimeSession = realtimeSessions.get(id);
          if (!realtimeSession) throw new Error("missing realtime session");
          realtimeSession.status = "active";
          realtimeSession.providerSessionId = providerSessionId ?? null;

          return realtimeSession;
        },
        async markEnded(id) {
          const realtimeSession = realtimeSessions.get(id);
          if (!realtimeSession) throw new Error("missing realtime session");
          realtimeSession.status = "ended";
          realtimeSession.endedAt = new Date("2026-06-08T00:02:00.000Z");

          return realtimeSession;
        },
        async markErrored(id, errorMessage) {
          const realtimeSession = realtimeSessions.get(id);
          if (!realtimeSession) throw new Error(errorMessage);
          realtimeSession.status = "errored";
          realtimeSession.endedAt = new Date("2026-06-08T00:02:00.000Z");
        },
      },
      messagesRepository: {
        async append(conversationId, input) {
          messages.push({ conversationId, role: input.role, content: input.content });
        },
      },
      liveAvatarProvider,
      elevenLabsAgentProvider: {
        async syncAvatarAgent() {
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
    },
  };

  return { dependencies, avatars, conversations, realtimeSessions, messages };
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@yuni.local", password: "demo-password" }),
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
        providerAgentId: string;
        sessionToken: string;
        sessionId: string;
        apiKey?: string;
      };
    };

    expect(response.status).toBe(201);
    expect(body.voiceSession).toMatchObject({
      conversationId: "conversation-1",
      realtimeSessionId: "realtime-1",
      providerAgentId: "agent-1",
      sessionToken: "liveavatar-session-token",
      sessionId: "liveavatar-session-id",
    });
    expect(body.voiceSession.apiKey).toBeUndefined();
    expect(state.avatars.get("avatar-1")?.providerSyncStatus).toBe("synced");
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

  it("returns LiveAvatar session errors with provider details", async () => {
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
      message: "Live Avatar returned code 4000: Invalid secret_id",
    });
    expect(state.realtimeSessions.get("realtime-1")?.status).toBe("errored");
    expect(state.conversations.get("conversation-1")?.status).toBe("ended");
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
    expect(state.messages).toEqual([
      { conversationId: "conversation-1", role: "user", content: "Hola" },
      { conversationId: "conversation-1", role: "assistant", content: "Hola, soy Tutor Demo." },
    ]);
    expect(state.conversations.get("conversation-1")?.status).toBe("ended");
  });
});
