import { describe, expect, it } from "vitest";
import { OwnershipError, type CreateAvatarAgentInput, type UpdateAvatarAgentInput } from "@yuni/domain";
import type { AvatarOption } from "@yuni/avatars";
import {
  ElevenLabsProviderError,
  ElevenLabsProviderUnavailableError,
  type ElevenLabsVoiceOption,
} from "@yuni/voice";
import type { PublicUser, UserWithPassword } from "./domains/auth/repository";
import type { AvatarAgentRecord } from "./domains/avatars/repository";
import { createApp, type AppDependencies } from "./app";

function createUser(overrides: Partial<UserWithPassword> = {}): UserWithPassword {
  const now = new Date("2026-05-15T00:00:00.000Z");

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
    name: "YUNI Demo",
    description: "Avatar de prueba",
    instructions: "Responde de forma clara y amable.",
    context: "Contexto inicial.",
    voiceConfig: { provider: "openai", voiceId: "alloy", speakingRate: 1 },
    liveAvatarConfig: { provider: "liveavatar", avatarId: "demo", mode: "lite", sandbox: true },
    status: "draft",
    ...overrides,
  };
}

function elevenLabsVoice(overrides: Partial<ElevenLabsVoiceOption> = {}): ElevenLabsVoiceOption {
  return {
    id: "voice-1",
    displayName: "Agustin",
    description: "Relaxed, warm and approachable.",
    provider: "elevenlabs",
    previewUrl: "https://cdn.elevenlabs.test/voice-1.mp3",
    category: "cloned",
    labels: { accent: "argentinian" },
    recommendedFor: "argentinian",
    ...overrides,
  };
}

function createAvatarRecord(
  ownerId: string,
  input: CreateAvatarAgentInput,
  overrides: Partial<AvatarAgentRecord> = {}
): AvatarAgentRecord {
  const now = new Date("2026-05-15T00:00:00.000Z");

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
    ...overrides,
  };
}

function createTestDependencies(
  initialUsers: UserWithPassword[] = [],
  runtimeLiveAvatarConfig = { mode: "lite", sandbox: true },
  liveAvatarProviderAvatars: AvatarOption[] = [],
  options: {
    elevenLabsVoices?: ElevenLabsVoiceOption[];
    listVoicesError?: Error;
    syncError?: Error;
  } = {}
): AppDependencies {
  const users = new Map(initialUsers.map((user) => [user.email, user]));
  const avatars = new Map<string, AvatarAgentRecord>();
  const liveAvatarProvider = {
    name: "liveavatar" as const,
    async listAvatars() {
      return liveAvatarProviderAvatars;
    },
    async createLiteSessionToken() {
      return {
        sessionToken: "liveavatar-session-token",
        sessionId: "liveavatar-session",
      };
    },
  };
  const elevenLabsVoiceProvider = {
    async listVoices() {
      if (options.listVoicesError) {
        throw options.listVoicesError;
      }

      return options.elevenLabsVoices ?? [];
    },
  };
  const elevenLabsAgentProvider = {
    async syncAvatarAgent() {
      if (options.syncError) {
        throw options.syncError;
      }

      return {
        providerAgentId: "agent-1",
        providerSyncFingerprint: "fingerprint",
        synced: true,
      };
    },
  };
  const avatarRepository = {
    async create(ownerId: string, input: CreateAvatarAgentInput) {
      const avatar = createAvatarRecord(ownerId, input, { id: `avatar-${avatars.size + 1}` });
      avatars.set(avatar.id, avatar);

      return avatar;
    },
    async listByOwner(ownerId: string) {
      return Array.from(avatars.values()).filter((avatar) => avatar.ownerId === ownerId);
    },
    async findByIdForOwner(ownerId: string, avatarId: string) {
      const avatar = avatars.get(avatarId);

      return avatar?.ownerId === ownerId ? avatar : null;
    },
    async findAccessibleForUser(userId: string, avatarId: string) {
      const avatar = avatars.get(avatarId);

      return avatar?.ownerId === userId ? { type: "owner" as const, avatar } : null;
    },
    async updateProviderSync(
      ownerId: string,
      avatarId: string,
      input: Parameters<
        NonNullable<AppDependencies["voiceSessions"]>["avatarsRepository"]["updateProviderSync"]
      >[2]
    ) {
      const avatar = avatars.get(avatarId);

      if (!avatar || avatar.ownerId !== ownerId) {
        throw new OwnershipError();
      }

      const updated: AvatarAgentRecord = {
        ...avatar,
        ...input,
        providerSyncError: input.providerSyncError ?? null,
        providerSyncedAt: input.providerSyncedAt ?? null,
        updatedAt: new Date("2026-05-16T00:00:00.000Z"),
      };

      avatars.set(avatarId, updated);

      return updated;
    },
    async updateForOwner(ownerId: string, avatarId: string, input: UpdateAvatarAgentInput) {
      const avatar = avatars.get(avatarId);

      if (!avatar || avatar.ownerId !== ownerId) {
        throw new OwnershipError();
      }

      const updated: AvatarAgentRecord = { ...avatar, updatedAt: new Date("2026-05-16T00:00:00.000Z") };

      if (input.name !== undefined) updated.name = input.name;
      if (input.description !== undefined) updated.description = input.description;
      if (input.instructions !== undefined) updated.instructions = input.instructions;
      if (input.context !== undefined) updated.context = input.context;
      if (input.voiceConfig !== undefined) updated.voiceConfig = input.voiceConfig;
      if (input.liveAvatarConfig !== undefined) updated.liveAvatarConfig = input.liveAvatarConfig;
      if (input.status !== undefined) updated.status = input.status;

      avatars.set(avatarId, updated);

      return updated;
    },
    async deleteForOwner(ownerId: string, avatarId: string) {
      const avatar = avatars.get(avatarId);

      if (!avatar || avatar.ownerId !== ownerId) {
        throw new OwnershipError();
      }

      avatars.delete(avatarId);

      return avatar;
    },
  };

  return {
    auth: {
      passwords: {
        async hash(password: string) {
          return `hash:${password}`;
        },
        async verify(password: string, passwordHash: string) {
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
      liveAvatarConfig: {
        mode: runtimeLiveAvatarConfig.mode,
        sandbox: runtimeLiveAvatarConfig.sandbox,
      },
      avatarProvider: liveAvatarProvider,
      elevenLabsVoiceProvider,
      elevenLabsAgentProvider,
      repository: avatarRepository,
    },
    liveAvatar: {
      provider: liveAvatarProvider,
    },
    voiceSessions: {
      avatarsRepository: avatarRepository,
      conversationsRepository: {
        async createPrivateForParticipant() {
          return { id: "conversation-1" };
        },
        async markEnded() {},
        async updateTitle() {},
      },
      realtimeSessionsRepository: {
        async create() {
          return { id: "realtime-1" };
        },
        async findPrivateForParticipant() {
          return null;
        },
        async markActive() {
          return {
            id: "realtime-1",
            conversationId: "conversation-1",
            providerSessionId: "liveavatar-session",
            status: "active",
            endedAt: null,
          };
        },
        async markEnded() {
          return {
            id: "realtime-1",
            conversationId: "conversation-1",
            providerSessionId: "liveavatar-session",
            status: "ended",
            endedAt: new Date("2026-05-16T00:00:00.000Z"),
          };
        },
        async markErrored() {},
      },
      messagesRepository: {
        async append() {},
      },
      liveAvatarProvider,
      elevenLabsAgentProvider,
    },
    voiceProviders: {
      elevenLabsVoiceProvider,
    },
  };
}

async function login(app: ReturnType<typeof createApp>, email = "demo@yuni.local") {
  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo-password" }),
  });

  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("@yuni/api avatars", () => {
  it("rejects anonymous ElevenLabs voice catalog requests", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/voice-providers/elevenlabs/voices");

    expect(response.status).toBe(401);
  });

  it("lists ElevenLabs My Voices for authenticated creators", async () => {
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [], {
        elevenLabsVoices: [elevenLabsVoice()],
      })
    );
    const cookie = await login(app);
    const response = await app.request("/voice-providers/elevenlabs/voices", { headers: { Cookie: cookie } });
    const body = (await json(response)) as { voices: ElevenLabsVoiceOption[] };

    expect(response.status).toBe(200);
    expect(body.voices).toEqual([elevenLabsVoice()]);
  });

  it("returns 503 when ElevenLabs voice catalog is not configured", async () => {
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [], {
        listVoicesError: new ElevenLabsProviderUnavailableError(),
      })
    );
    const cookie = await login(app);
    const response = await app.request("/voice-providers/elevenlabs/voices", { headers: { Cookie: cookie } });

    expect(response.status).toBe(503);
  });

  it("rejects anonymous list requests", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/avatars");

    expect(response.status).toBe(401);
  });

  it("rejects anonymous create requests", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(avatarInput()),
    });

    expect(response.status).toBe(401);
  });

  it("creates an avatar for the authenticated creator", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(avatarInput({ name: "Avatar creado" })),
    });
    const body = (await json(response)) as { avatar: { name: string; ownerId?: string } };

    expect(response.status).toBe(201);
    expect(body.avatar.name).toBe("Avatar creado");
    expect(body.avatar.ownerId).toBeUndefined();
  });

  it("creates an avatar with a trusted ElevenLabs voice and eager provider sync", async () => {
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [], {
        elevenLabsVoices: [elevenLabsVoice()],
      })
    );
    const cookie = await login(app);
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(
        avatarInput({
          voiceConfig: {
            provider: "elevenlabs",
            voiceId: "voice-1",
            displayName: "Client Supplied Voice",
            description: "Untrusted description.",
            speakingRate: 1,
          },
        })
      ),
    });
    const body = (await json(response)) as {
      avatar: {
        voiceConfig: { provider: string; voiceId: string; displayName?: string; description?: string };
        providerStatus: string;
      };
    };

    expect(response.status).toBe(201);
    expect(body.avatar.voiceConfig).toMatchObject({
      provider: "elevenlabs",
      voiceId: "voice-1",
      displayName: "Agustin",
      description: "Relaxed, warm and approachable.",
    });
    expect(body.avatar.providerStatus).toBe("ready");
    expect(body.avatar).not.toHaveProperty("providerAgentId");
    expect(body.avatar).not.toHaveProperty("providerSyncError");
  });

  it("keeps the created avatar with failed sync state when ElevenLabs Agent sync fails", async () => {
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [], {
        elevenLabsVoices: [elevenLabsVoice()],
        syncError: new ElevenLabsProviderError("ElevenLabs returned 400: bad agent config"),
      })
    );
    const cookie = await login(app);
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(
        avatarInput({
          voiceConfig: {
            provider: "elevenlabs",
            voiceId: "voice-1",
            speakingRate: 1,
          },
        })
      ),
    });
    const body = (await json(response)) as {
      avatar: { id: string; providerStatus: string };
    };
    const getResponse = await app.request(`/avatars/${body.avatar.id}`, { headers: { Cookie: cookie } });
    const getBody = (await json(getResponse)) as {
      avatar: { providerStatus: string };
    };

    expect(response.status).toBe(201);
    expect(body.avatar.providerStatus).toBe("needs_attention");
    expect(body.avatar).not.toHaveProperty("providerSyncError");
    expect(getBody.avatar.providerStatus).toBe("needs_attention");
  });

  it("rejects new ElevenLabs voices when the provider catalog cannot validate metadata", async () => {
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [], {
        listVoicesError: new ElevenLabsProviderUnavailableError(),
      })
    );
    const cookie = await login(app);
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(
        avatarInput({
          voiceConfig: {
            provider: "elevenlabs",
            voiceId: "voice-1",
            displayName: "Client Supplied Voice",
            description: "Untrusted description.",
            speakingRate: 1,
          },
        })
      ),
    });
    const listResponse = await app.request("/avatars", { headers: { Cookie: cookie } });
    const listBody = (await json(listResponse)) as { avatars: unknown[] };

    expect(response.status).toBe(503);
    expect(listBody.avatars).toHaveLength(0);
  });

  it("rejects a new ElevenLabs voice id that is not present in My Voices", async () => {
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [], {
        elevenLabsVoices: [elevenLabsVoice({ id: "other-voice" })],
      })
    );
    const cookie = await login(app);
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(
        avatarInput({
          voiceConfig: {
            provider: "elevenlabs",
            voiceId: "missing-voice",
            speakingRate: 1,
          },
        })
      ),
    });

    expect(response.status).toBe(400);
  });

  it("preserves an existing ElevenLabs voice snapshot when updating the same voice and catalog lookup fails", async () => {
    const providerOptions: {
      elevenLabsVoices?: ElevenLabsVoiceOption[];
      listVoicesError?: Error;
    } = {
      elevenLabsVoices: [elevenLabsVoice()],
    };
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [], providerOptions)
    );
    const cookie = await login(app);
    const createResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(
        avatarInput({
          voiceConfig: {
            provider: "elevenlabs",
            voiceId: "voice-1",
            speakingRate: 1,
          },
        })
      ),
    });
    const createBody = (await json(createResponse)) as { avatar: { id: string } };

    providerOptions.elevenLabsVoices = [];
    providerOptions.listVoicesError = new ElevenLabsProviderError("ElevenLabs returned 500");

    const updateResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: "Avatar actualizado",
        voiceConfig: {
          provider: "elevenlabs",
          voiceId: "voice-1",
          displayName: "Client Supplied Voice",
          description: "Untrusted description.",
          speakingRate: 1,
        },
      }),
    });
    const updateBody = (await json(updateResponse)) as {
      avatar: { voiceConfig: { displayName?: string; description?: string } };
    };

    expect(updateResponse.status).toBe(200);
    expect(updateBody.avatar.voiceConfig).toMatchObject({
      displayName: "Agustin",
      description: "Relaxed, warm and approachable.",
    });
  });

  it("rejects changing to a new ElevenLabs voice when catalog lookup fails", async () => {
    const providerOptions: {
      elevenLabsVoices?: ElevenLabsVoiceOption[];
      listVoicesError?: Error;
    } = {
      elevenLabsVoices: [elevenLabsVoice()],
    };
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [], providerOptions)
    );
    const cookie = await login(app);
    const createResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(
        avatarInput({
          voiceConfig: {
            provider: "elevenlabs",
            voiceId: "voice-1",
            speakingRate: 1,
          },
        })
      ),
    });
    const createBody = (await json(createResponse)) as { avatar: { id: string } };

    providerOptions.elevenLabsVoices = [];
    providerOptions.listVoicesError = new ElevenLabsProviderError("ElevenLabs returned 500");

    const updateResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        voiceConfig: {
          provider: "elevenlabs",
          voiceId: "voice-2",
          displayName: "Client Supplied Voice",
          description: "Untrusted description.",
          speakingRate: 1,
        },
      }),
    });
    const getResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      headers: { Cookie: cookie },
    });
    const getBody = (await json(getResponse)) as { avatar: { voiceConfig: { voiceId?: string } } };

    expect(updateResponse.status).toBe(502);
    expect(getBody.avatar.voiceConfig.voiceId).toBe("voice-1");
  });

  it("lists only avatars owned by the authenticated creator", async () => {
    const app = createApp(
      createTestDependencies([
        createUser({ id: "user-1", email: "demo@yuni.local" }),
        createUser({ id: "user-2", email: "other@yuni.local" }),
      ])
    );
    const ownCookie = await login(app, "demo@yuni.local");
    const otherCookie = await login(app, "other@yuni.local");

    await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownCookie },
      body: JSON.stringify(avatarInput({ name: "Propio" })),
    });
    await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: otherCookie },
      body: JSON.stringify(avatarInput({ name: "Ajeno" })),
    });

    const response = await app.request("/avatars", { headers: { Cookie: ownCookie } });
    const body = (await json(response)) as { avatars: Array<{ name: string }> };

    expect(response.status).toBe(200);
    expect(body.avatars).toHaveLength(1);
    expect(body.avatars[0]?.name).toBe("Propio");
  });

  it("gets, updates and deletes an owned avatar", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const createResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(avatarInput()),
    });
    const createBody = (await json(createResponse)) as { avatar: { id: string } };

    const getResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      headers: { Cookie: cookie },
    });
    expect(getResponse.status).toBe(200);

    const updateResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Avatar actualizado" }),
    });
    const updateBody = (await json(updateResponse)) as { avatar: { name: string } };
    expect(updateResponse.status).toBe(200);
    expect(updateBody.avatar.name).toBe("Avatar actualizado");

    const deleteResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(deleteResponse.status).toBe(200);

    const deletedGetResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      headers: { Cookie: cookie },
    });
    expect(deletedGetResponse.status).toBe(404);
  });

  it("preserves avatar status when patch payload does not include status", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const createResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(avatarInput({ status: "active" })),
    });
    const createBody = (await json(createResponse)) as { avatar: { id: string } };

    const updateResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Avatar actualizado" }),
    });
    const updateBody = (await json(updateResponse)) as { avatar: { status: string } };

    expect(updateResponse.status).toBe(200);
    expect(updateBody.avatar.status).toBe("active");
  });

  it("stores Live Avatar runtime mode and sandbox from server dependencies", async () => {
    const app = createApp(createTestDependencies([createUser()], { mode: "provider-mode", sandbox: false }));
    const cookie = await login(app);
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(avatarInput()),
    });
    const body = (await json(response)) as {
      avatar: { liveAvatarConfig: { mode: string; sandbox: boolean } };
    };

    expect(response.status).toBe(201);
    expect(body.avatar.liveAvatarConfig).toMatchObject({ mode: "provider-mode", sandbox: false });
  });

  it("persists trusted Live Avatar visual metadata resolved from the provider", async () => {
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, [
        {
          id: "demo",
          displayName: "Trusted Demo Avatar",
          thumbnailUrl: "https://cdn.liveavatar.test/trusted-demo.png",
          provider: "liveavatar",
          mode: "lite",
          sandbox: true,
        },
      ])
    );
    const cookie = await login(app);
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(
        avatarInput({
          liveAvatarConfig: {
            provider: "liveavatar",
            avatarId: "demo",
            displayName: "Client Supplied Avatar",
            thumbnailUrl: "https://untrusted.example/avatar.png",
            mode: "lite",
            sandbox: true,
          },
        })
      ),
    });
    const body = (await json(response)) as {
      avatar: { id: string; liveAvatarConfig: { displayName?: string; thumbnailUrl?: string | null } };
    };
    const getResponse = await app.request(`/avatars/${body.avatar.id}`, { headers: { Cookie: cookie } });
    const getBody = (await json(getResponse)) as {
      avatar: { liveAvatarConfig: { displayName?: string; thumbnailUrl?: string | null } };
    };

    expect(response.status).toBe(201);
    expect(body.avatar.liveAvatarConfig).toMatchObject({
      displayName: "Trusted Demo Avatar",
      thumbnailUrl: "https://cdn.liveavatar.test/trusted-demo.png",
    });
    expect(getBody.avatar.liveAvatarConfig).toMatchObject({
      displayName: "Trusted Demo Avatar",
      thumbnailUrl: "https://cdn.liveavatar.test/trusted-demo.png",
    });
  });

  it("strips unverified Live Avatar visual metadata when the provider cannot resolve the avatar", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const response = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(
        avatarInput({
          liveAvatarConfig: {
            provider: "liveavatar",
            avatarId: "demo",
            displayName: "Client Supplied Avatar",
            thumbnailUrl: "https://untrusted.example/avatar.png",
            mode: "lite",
            sandbox: true,
          },
        })
      ),
    });
    const body = (await json(response)) as {
      avatar: { liveAvatarConfig: { displayName?: string; thumbnailUrl?: string | null } };
    };

    expect(response.status).toBe(201);
    expect(body.avatar.liveAvatarConfig.displayName).toBeUndefined();
    expect(body.avatar.liveAvatarConfig.thumbnailUrl).toBeUndefined();
  });

  it("preserves the existing trusted Live Avatar snapshot when updating the same avatar and provider lookup fails", async () => {
    const providerAvatars: AvatarOption[] = [
      {
        id: "demo",
        displayName: "Trusted Demo Avatar",
        thumbnailUrl: "https://cdn.liveavatar.test/trusted-demo.png",
        provider: "liveavatar",
        mode: "lite",
        sandbox: true,
      },
    ];
    const app = createApp(
      createTestDependencies([createUser()], { mode: "lite", sandbox: true }, providerAvatars)
    );
    const cookie = await login(app);
    const createResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(avatarInput()),
    });
    const createBody = (await json(createResponse)) as { avatar: { id: string } };

    providerAvatars.length = 0;

    const updateResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: "Avatar actualizado",
        liveAvatarConfig: {
          provider: "liveavatar",
          avatarId: "demo",
          displayName: "Client Supplied Avatar",
          thumbnailUrl: "https://untrusted.example/avatar.png",
          mode: "lite",
          sandbox: true,
        },
      }),
    });
    const updateBody = (await json(updateResponse)) as {
      avatar: { name: string; liveAvatarConfig: { displayName?: string; thumbnailUrl?: string | null } };
    };

    expect(updateResponse.status).toBe(200);
    expect(updateBody.avatar.name).toBe("Avatar actualizado");
    expect(updateBody.avatar.liveAvatarConfig).toMatchObject({
      displayName: "Trusted Demo Avatar",
      thumbnailUrl: "https://cdn.liveavatar.test/trusted-demo.png",
    });
  });

  it("returns 404 when accessing another creator avatar", async () => {
    const app = createApp(
      createTestDependencies([
        createUser({ id: "user-1", email: "demo@yuni.local" }),
        createUser({ id: "user-2", email: "other@yuni.local" }),
      ])
    );
    const ownCookie = await login(app, "demo@yuni.local");
    const otherCookie = await login(app, "other@yuni.local");
    const createResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: otherCookie },
      body: JSON.stringify(avatarInput()),
    });
    const createBody = (await json(createResponse)) as { avatar: { id: string } };

    const getResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      headers: { Cookie: ownCookie },
    });
    const patchResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownCookie },
      body: JSON.stringify({ name: "Nope" }),
    });
    const deleteResponse = await app.request(`/avatars/${createBody.avatar.id}`, {
      method: "DELETE",
      headers: { Cookie: ownCookie },
    });

    expect(getResponse.status).toBe(404);
    expect(patchResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });

  it("rejects invalid create and update payloads", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);

    const invalidCreateResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...avatarInput(), ownerId: "attacker" }),
    });
    const invalidPatchResponse = await app.request("/avatars/avatar-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    const overriddenRuntimeConfigResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        ...avatarInput(),
        liveAvatarConfig: { provider: "liveavatar", avatarId: "demo", mode: "full", sandbox: true },
      }),
    });
    const overriddenRuntimeConfigBody = (await json(overriddenRuntimeConfigResponse)) as {
      avatar: { liveAvatarConfig: { mode: string; sandbox: boolean } };
    };
    const overriddenSandboxResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        ...avatarInput(),
        liveAvatarConfig: { provider: "liveavatar", avatarId: "demo", mode: "lite", sandbox: false },
      }),
    });
    const overriddenSandboxBody = (await json(overriddenSandboxResponse)) as {
      avatar: { liveAvatarConfig: { mode: string; sandbox: boolean } };
    };

    expect(invalidCreateResponse.status).toBe(400);
    expect(invalidPatchResponse.status).toBe(400);
    expect(overriddenRuntimeConfigResponse.status).toBe(201);
    expect(overriddenRuntimeConfigBody.avatar.liveAvatarConfig).toMatchObject({
      mode: "lite",
      sandbox: true,
    });
    expect(overriddenSandboxResponse.status).toBe(201);
    expect(overriddenSandboxBody.avatar.liveAvatarConfig).toMatchObject({ mode: "lite", sandbox: true });
  });
});
