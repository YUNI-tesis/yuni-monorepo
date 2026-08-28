import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser, UserWithPassword } from "./domains/auth/repository";
import { createSessionToken, SESSION_COOKIE_NAME } from "./domains/auth/session";
import { createApp, normalizeBrowserOrigin, type AppDependencies } from "./app";

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

function createTestDependencies(initialUsers: UserWithPassword[] = []): AppDependencies {
  const users = new Map(initialUsers.map((user) => [user.email, user]));
  const avatarRepository = {
    async create() {
      throw new Error("Avatar repository is not used in auth tests");
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
    async updateProviderSync() {
      throw new Error("Avatar repository is not used in auth tests");
    },
    async updateForOwner() {
      throw new Error("Avatar repository is not used in auth tests");
    },
    async deleteForOwner() {
      throw new Error("Avatar repository is not used in auth tests");
    },
  };
  const liveAvatarProvider = {
    name: "liveavatar" as const,
    async listAvatars() {
      return [];
    },
    async createLiteSessionToken() {
      return {
        sessionToken: "liveavatar-session-token",
        sessionId: "liveavatar-session",
      };
    },
    async stopSession() {},
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
        async markPrepared() {
          return {
            id: "realtime-1",
            conversationId: "conversation-1",
            providerSessionId: "liveavatar-session",
            status: "connecting",
            endedAt: null,
          };
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
        async markErrored() {
          return true;
        },
        async failUnconfirmedOwnerStart() {
          return true;
        },
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

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("@yuni/api auth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers a user and sets the session cookie", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "demo-password",
        name: "Demo",
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("yuni_session=");
  });

  it("does not block registration or login when access grant linking fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dependencies = createTestDependencies([createUser()]);
    const linkActiveForUser = vi.fn().mockRejectedValue(new Error("temporary write failure"));
    dependencies.auth.accessGrantLinker = { linkActiveForUser };
    const app = createApp(dependencies);

    const loginResponse = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "demo-password",
      }),
    });
    const registerResponse = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new-user@yuni.local",
        password: "demo-password",
      }),
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("set-cookie")).toContain("yuni_session=");
    expect(registerResponse.status).toBe(201);
    expect(registerResponse.headers.get("set-cookie")).toContain("yuni_session=");
    expect(linkActiveForUser).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate registration", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "demo-password",
      }),
    });

    expect(response.status).toBe(409);
  });

  it("logs in with valid credentials", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "demo-password",
      }),
    });

    const body = (await json(response)) as { user: { email: string }; passwordHash?: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("yuni_session=");
    expect(body.user.email).toBe("demo@yuni.local");
    expect(body.passwordHash).toBeUndefined();
  });

  it("allows login to replace an invalid stale session cookie", async () => {
    const dependencies = createTestDependencies([createUser()]);
    const findPublicById = vi.spyOn(dependencies.auth.repository, "findPublicById");
    const app = createApp(dependencies);
    const response = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=stale-invalid-token`,
      },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "demo-password",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).not.toContain("Max-Age=0");
    expect(findPublicById).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "wrong-password",
      }),
    });
    const body = (await json(response)) as { error: { reason?: string } };

    expect(response.status).toBe(401);
    expect(body.error.reason).toBeUndefined();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns the current session user with a valid cookie", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const loginResponse = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "demo-password",
      }),
    });
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const response = await app.request("/me", {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
  });

  it("rejects current session lookup without a cookie", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/me");
    const body = (await json(response)) as { error: { reason?: string } };

    expect(response.status).toBe(401);
    expect(body.error.reason).toBe("SESSION_REQUIRED");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("clears an invalid creator session cookie", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/me", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=not-a-jwt` },
    });
    const body = (await json(response)) as { error: { reason?: string } };

    expect(response.status).toBe(401);
    expect(body.error.reason).toBe("SESSION_INVALID");
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects a signed session for a deleted user before private handlers run", async () => {
    const dependencies = createTestDependencies();
    const findPublicById = vi.spyOn(dependencies.auth.repository, "findPublicById");
    const listByOwner = vi.spyOn(dependencies.avatars.repository, "listByOwner");
    const createAvatar = vi.spyOn(dependencies.avatars.repository, "create");
    const listProviderAvatars = vi.spyOn(dependencies.liveAvatar.provider, "listAvatars");
    const app = createApp(dependencies);
    const token = await createSessionToken({
      id: "deleted-user",
      email: "deleted@yuni.local",
      name: "Deleted",
    });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    const meResponse = await app.request("/me", { headers: { Cookie: cookie } });
    const listResponse = await app.request("/avatars", { headers: { Cookie: cookie } });
    const createResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    const providerResponse = await app.request("/live-avatar/avatars", {
      headers: { Cookie: cookie },
    });
    const body = (await json(createResponse)) as { error: { reason?: string } };

    expect([meResponse.status, listResponse.status, createResponse.status, providerResponse.status]).toEqual([
      401, 401, 401, 401,
    ]);
    expect(body.error.reason).toBe("SESSION_INVALID");
    expect(createResponse.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(findPublicById).toHaveBeenCalledTimes(4);
    expect(listByOwner).not.toHaveBeenCalled();
    expect(createAvatar).not.toHaveBeenCalled();
    expect(listProviderAvatars).not.toHaveBeenCalled();
  });

  it("does not clear the session cookie when user lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dependencies = createTestDependencies([createUser()]);
    vi.spyOn(dependencies.auth.repository, "findPublicById").mockRejectedValue(
      new Error("database unavailable")
    );
    const listByOwner = vi.spyOn(dependencies.avatars.repository, "listByOwner");
    const app = createApp(dependencies);
    const token = await createSessionToken(publicUser(createUser()));

    const response = await app.request("/avatars", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(listByOwner).not.toHaveBeenCalled();
  });

  it("looks up the current user once per private request", async () => {
    const dependencies = createTestDependencies([createUser()]);
    const findPublicById = vi.spyOn(dependencies.auth.repository, "findPublicById");
    const app = createApp(dependencies);
    const loginResponse = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "demo-password",
      }),
    });
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] ?? "";

    const response = await app.request("/avatars", { headers: { Cookie: cookie } });

    expect(response.status).toBe(200);
    expect(findPublicById).toHaveBeenCalledTimes(1);
  });

  it("allows CORS preflight for private routes without a session", async () => {
    const dependencies = createTestDependencies([createUser()]);
    const findPublicById = vi.spyOn(dependencies.auth.repository, "findPublicById");
    const app = createApp(dependencies);

    const response = await app.request("/avatars", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(response.status).toBe(204);
    expect(findPublicById).not.toHaveBeenCalled();
  });

  it("clears a stale session cookie when its user no longer exists", async () => {
    const appWithUser = createApp(createTestDependencies([createUser()]));
    const loginResponse = await appWithUser.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@yuni.local",
        password: "demo-password",
      }),
    });
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] ?? "";

    const appAfterDatabaseReset = createApp(createTestDependencies());
    const response = await appAfterDatabaseReset.request("/me", {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("yuni_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("clears the session cookie on logout", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const response = await app.request("/auth/logout", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("yuni_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("allows only the exact configured browser origin", async () => {
    const app = createApp(createTestDependencies());
    const allowed = await app.request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });
    const rejected = await app.request("/health", {
      headers: { Origin: "https://attacker.example" },
    });

    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(rejected.status).toBe(403);
    expect(await json(rejected)).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("allows validated request IDs through browser CORS preflights", async () => {
    const app = createApp(createTestDependencies());
    const response = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "X-Request-ID",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Request-ID");
  });

  it("normalizes configured web URLs to their browser origin", () => {
    expect(normalizeBrowserOrigin("https://app.yuni.example/")).toBe("https://app.yuni.example");
    expect(normalizeBrowserOrigin("https://app.yuni.example/dashboard")).toBe("https://app.yuni.example");
  });

  it("accepts safe request IDs and replaces invalid values", async () => {
    const app = createApp(createTestDependencies());
    const accepted = await app.request("/health", { headers: { "X-Request-Id": "client:request-1" } });
    const rejected = await app.request("/health", {
      headers: { "X-Request-Id": "invalid request id with spaces" },
    });

    expect(accepted.headers.get("x-request-id")).toBe("client:request-1");
    expect(rejected.headers.get("x-request-id")).not.toBe("invalid request id with spaces");
    expect(rejected.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("redacts credentials, emails and proxy headers from request logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const app = createApp(createTestDependencies());
    await app.request("/health?email=private@example.com", {
      headers: {
        Authorization: "Bearer private-token",
        Cookie: "yuni_session=private-cookie",
        "X-Forwarded-For": "203.0.113.10",
        "X-Api-Key": "private-key",
      },
    });

    const output = log.mock.calls.flat().join("\n");
    expect(output).not.toContain("private@example.com");
    expect(output).not.toContain("private-token");
    expect(output).not.toContain("private-cookie");
    expect(output).not.toContain("203.0.113.10");
    expect(output).not.toContain("private-key");
    expect(output).toContain("[redacted]");
  });
});
