import { describe, expect, it } from "vitest";
import {
  AvatarProviderError,
  AvatarProviderTimeoutError,
  AvatarProviderUnavailableError,
  type AvatarOption,
} from "@yuni/avatars";
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

function createTestDependencies(providerError?: Error): AppDependencies {
  const user = createUser();
  const avatars: AvatarOption[] = [
    {
      id: "liveavatar-1",
      displayName: "Live Avatar One",
      thumbnailUrl: "https://cdn.liveavatar.test/one.png",
      provider: "liveavatar",
      mode: "lite",
      sandbox: true,
    },
  ];
  const liveAvatarProvider = {
    name: "liveavatar" as const,
    async listAvatars() {
      if (providerError) {
        throw providerError;
      }

      return avatars;
    },
    async createLiteSessionToken() {
      return {
        sessionToken: "liveavatar-session-token",
        sessionId: "liveavatar-session",
      };
    },
    async stopSession() {},
  };
  const avatarRepository = {
    async create(): Promise<AvatarAgentRecord> {
      throw new Error("Avatar repository is not used in live avatar tests");
    },
    async listByOwner() {
      return [];
    },
    async findByIdForOwner() {
      return null;
    },
    async findAccessibleForUser() {
      return null;
    },
    async updateProviderSync(): Promise<AvatarAgentRecord> {
      throw new Error("Avatar repository is not used in live avatar tests");
    },
    async updateForOwner(): Promise<AvatarAgentRecord> {
      throw new Error("Avatar repository is not used in live avatar tests");
    },
    async deleteForOwner(): Promise<AvatarAgentRecord> {
      throw new Error("Avatar repository is not used in live avatar tests");
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
        async createWithPassword() {
          return publicUser(user);
        },
        async findByEmail(email) {
          return email === user.email ? user : null;
        },
        async findPublicById(userId) {
          return userId === user.id ? publicUser(user) : null;
        },
        async existsByEmail() {
          return false;
        },
      },
    },
    avatars: {
      liveAvatarConfig: {
        mode: "lite",
        sandbox: true,
      },
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
        async finalizePrivate(input) {
          return {
            session: {
              id: input.realtimeSessionId,
              conversationId: input.conversationId,
              status: "ended",
              endedAt: new Date("2026-05-16T00:00:00.000Z"),
            },
            finalized: true,
          };
        },
        async markErrored() {},
        async markProviderStopped() {},
        async expireSharedIfActive() {},
      },
      liveAvatarProvider,
      elevenLabsAgentProvider: {
        async syncAvatarAgent() {
          return {
            providerAgentId: "agent-1",
            providerSyncFingerprint: "fingerprint",
            synced: true,
          };
        },
      },
    },
  };
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

describe("@yuni/api live avatar", () => {
  it("rejects anonymous avatar list requests", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/live-avatar/avatars");

    expect(response.status).toBe(401);
  });

  it("returns normalized Live Avatar options for authenticated creators", async () => {
    const app = createApp(createTestDependencies());
    const cookie = await login(app);
    const response = await app.request("/live-avatar/avatars", { headers: { Cookie: cookie } });
    const body = (await json(response)) as { avatars: AvatarOption[]; apiKey?: string };

    expect(response.status).toBe(200);
    expect(body.avatars).toEqual([
      {
        id: "liveavatar-1",
        displayName: "Live Avatar One",
        thumbnailUrl: "https://cdn.liveavatar.test/one.png",
        provider: "liveavatar",
        mode: "lite",
        sandbox: true,
      },
    ]);
    expect(body.apiKey).toBeUndefined();
  });

  it("returns 503 when Live Avatar is not configured", async () => {
    const app = createApp(createTestDependencies(new AvatarProviderUnavailableError()));
    const cookie = await login(app);
    const response = await app.request("/live-avatar/avatars", { headers: { Cookie: cookie } });

    expect(response.status).toBe(503);
  });

  it("returns 502 when Live Avatar provider fails", async () => {
    const app = createApp(createTestDependencies(new AvatarProviderError("provider failed")));
    const cookie = await login(app);
    const response = await app.request("/live-avatar/avatars", { headers: { Cookie: cookie } });

    expect(response.status).toBe(502);
  });

  it("returns 502 when Live Avatar provider times out", async () => {
    const app = createApp(createTestDependencies(new AvatarProviderTimeoutError()));
    const cookie = await login(app);
    const response = await app.request("/live-avatar/avatars", { headers: { Cookie: cookie } });
    const body = (await json(response)) as { error: { message: string } };

    expect(response.status).toBe(502);
    expect(body.error.message).toBe("Live Avatar provider timed out");
  });
});
