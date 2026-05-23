import { describe, expect, it } from "vitest";
import type { PublicUser, UserWithPassword } from "./domains/auth/repository";
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

function createTestDependencies(initialUsers: UserWithPassword[] = []): AppDependencies {
  const users = new Map(initialUsers.map((user) => [user.email, user]));

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
      repository: {
        async create() {
          throw new Error("Avatar repository is not used in auth tests");
        },
        async listByOwner() {
          return [];
        },
        async findByIdForOwner() {
          return null;
        },
        async updateForOwner() {
          throw new Error("Avatar repository is not used in auth tests");
        },
        async deleteForOwner() {
          throw new Error("Avatar repository is not used in auth tests");
        },
      },
    },
    liveAvatar: {
      provider: {
        name: "liveavatar",
        async listAvatars() {
          return [];
        },
      },
    },
  };
}

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("@yuni/api auth", () => {
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

    expect(response.status).toBe(401);
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

    expect(response.status).toBe(401);
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
});
