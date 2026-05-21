import { describe, expect, it } from "vitest";
import { OwnershipError, type CreateAvatarAgentInput, type UpdateAvatarAgentInput } from "@yuni/domain";
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
    status: input.status,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTestDependencies(initialUsers: UserWithPassword[] = []): AppDependencies {
  const users = new Map(initialUsers.map((user) => [user.email, user]));
  const avatars = new Map<string, AvatarAgentRecord>();

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
      repository: {
        async create(ownerId, input) {
          const avatar = createAvatarRecord(ownerId, input, { id: `avatar-${avatars.size + 1}` });
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
        async updateForOwner(ownerId, avatarId, input: UpdateAvatarAgentInput) {
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
        async deleteForOwner(ownerId, avatarId) {
          const avatar = avatars.get(avatarId);

          if (!avatar || avatar.ownerId !== ownerId) {
            throw new OwnershipError();
          }

          avatars.delete(avatarId);

          return avatar;
        },
      },
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

    const getResponse = await app.request(`/avatars/${createBody.avatar.id}`, { headers: { Cookie: cookie } });
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

    const deletedGetResponse = await app.request(`/avatars/${createBody.avatar.id}`, { headers: { Cookie: cookie } });
    expect(deletedGetResponse.status).toBe(404);
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

    const getResponse = await app.request(`/avatars/${createBody.avatar.id}`, { headers: { Cookie: ownCookie } });
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
    const invalidModeResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        ...avatarInput(),
        liveAvatarConfig: { provider: "liveavatar", avatarId: "demo", mode: "full", sandbox: true },
      }),
    });
    const invalidSandboxResponse = await app.request("/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        ...avatarInput(),
        liveAvatarConfig: { provider: "liveavatar", avatarId: "demo", mode: "lite", sandbox: false },
      }),
    });

    expect(invalidCreateResponse.status).toBe(400);
    expect(invalidPatchResponse.status).toBe(400);
    expect(invalidModeResponse.status).toBe(400);
    expect(invalidSandboxResponse.status).toBe(400);
  });
});
