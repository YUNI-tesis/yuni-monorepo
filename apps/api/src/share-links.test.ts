import { describe, expect, it } from "vitest";
import {
  OwnershipError,
  SelfAccessGrantError,
  type CreateAvatarAgentInput,
  type CreateAccessGrantInput,
  type CreateShareLinkInput,
  type UpdateAvatarAgentInput,
  type UpdateShareLinkInput,
} from "@yuni/domain";
import type { PublicUser, UserWithPassword } from "./domains/auth/repository";
import type { AvatarAgentRecord } from "./domains/avatars/repository";
import type { ShareLinkRecord } from "./domains/share/repository";
import type { AccessGrantRecord } from "./domains/share/access-grant-repository";
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
    status: "active",
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

function createTestDependencies(initialUsers: UserWithPassword[] = []): AppDependencies {
  const users = new Map(initialUsers.map((user) => [user.email, user]));
  const avatars = new Map<string, AvatarAgentRecord>();
  const shareLinks = new Map<string, ShareLinkRecord>();
  const accessGrants = new Map<string, AccessGrantRecord>();

  async function linkActiveForUser(userId: string, participantEmail: string) {
    for (const [grantId, grant] of accessGrants) {
      if (
        grant.participantEmail === participantEmail &&
        grant.participantUserId === null &&
        grant.status === "active"
      ) {
        accessGrants.set(grantId, { ...grant, participantUserId: userId });
      }
    }
  }

  return {
    auth: {
      accessGrantLinker: { linkActiveForUser },
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
      avatarProvider: {
        async listAvatars() {
          return [];
        },
      },
      repository: {
        async create(ownerId, input) {
          const avatar = createAvatarRecord(ownerId, input, { id: `avatar-${avatars.size + 1}` });
          avatars.set(avatar.id, avatar);

          return avatar;
        },
        async listByOwner(ownerId) {
          return Array.from(avatars.values()).filter((avatar) => avatar.ownerId === ownerId);
        },
        async listSharedByUser(participantUserId) {
          const avatarIds = new Set(
            Array.from(accessGrants.values())
              .filter((grant) => grant.participantUserId === participantUserId && grant.status === "active")
              .map((grant) => grant.avatarAgentId)
          );

          return Array.from(avatars.values()).filter(
            (avatar) => avatar.status === "active" && avatarIds.has(avatar.id)
          );
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
              grant.avatarAgentId === avatarId &&
              grant.participantUserId === userId &&
              grant.status === "active"
          );

          return avatar.status === "active" && accessGrant
            ? { type: "shared" as const, avatar, accessGrant }
            : null;
        },
        async updateProviderSync(ownerId, avatarId, input) {
          const avatar = avatars.get(avatarId);
          if (!avatar || avatar.ownerId !== ownerId) throw new OwnershipError();

          const updated: AvatarAgentRecord = {
            ...avatar,
            ...input,
            providerSyncError: input.providerSyncError ?? null,
            updatedAt: new Date("2026-05-16T00:00:00.000Z"),
          };
          avatars.set(avatarId, updated);
          return updated;
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
    liveAvatar: {
      provider: {
        name: "liveavatar",
        async listAvatars() {
          return [];
        },
        async createLiteSessionToken() {
          return { sessionToken: "token", sessionId: "session" };
        },
        async stopSession() {},
      },
    },
    share: {
      publicBaseUrl: "http://localhost:3000",
      repository: {
        async create(ownerId, avatarAgentId, input: CreateShareLinkInput) {
          const avatar = avatars.get(avatarAgentId);

          if (!avatar || avatar.ownerId !== ownerId) {
            throw new OwnershipError();
          }

          if (Array.from(shareLinks.values()).some((shareLink) => shareLink.slug === input.slug)) {
            throw { code: "P2002" };
          }

          const now = new Date("2026-05-15T00:00:00.000Z");
          const shareLink: ShareLinkRecord = {
            id: `share-link-${shareLinks.size + 1}`,
            ownerId,
            avatarAgentId,
            slug: input.slug,
            name: input.name,
            isEnabled: input.isEnabled,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: null,
            ...(input.limits ?? {}),
          };

          shareLinks.set(shareLink.id, shareLink);

          return shareLink;
        },
        async listForAvatar(ownerId, avatarAgentId) {
          const avatar = avatars.get(avatarAgentId);

          if (!avatar || avatar.ownerId !== ownerId) {
            throw new OwnershipError();
          }

          return Array.from(shareLinks.values()).filter(
            (shareLink) => shareLink.ownerId === ownerId && shareLink.avatarAgentId === avatarAgentId
          );
        },
        async updateForAvatar(ownerId, avatarAgentId, shareLinkId, input: UpdateShareLinkInput) {
          const shareLink = shareLinks.get(shareLinkId);

          if (!shareLink || shareLink.ownerId !== ownerId || shareLink.avatarAgentId !== avatarAgentId) {
            throw new OwnershipError();
          }

          const updated: ShareLinkRecord = { ...shareLink, updatedAt: new Date("2026-05-16T00:00:00.000Z") };

          if (input.name !== undefined) updated.name = input.name;
          if (input.isEnabled !== undefined) updated.isEnabled = input.isEnabled;
          if (input.limits !== undefined) Object.assign(updated, input.limits);

          shareLinks.set(shareLinkId, updated);

          return updated;
        },
        async deleteForAvatar(ownerId, avatarAgentId, shareLinkId) {
          const shareLink = shareLinks.get(shareLinkId);

          if (!shareLink || shareLink.ownerId !== ownerId || shareLink.avatarAgentId !== avatarAgentId) {
            throw new OwnershipError();
          }

          shareLinks.delete(shareLinkId);

          return shareLink;
        },
        async resolveEnabledBySlug(slug) {
          const shareLink = Array.from(shareLinks.values()).find(
            (candidate) => candidate.slug === slug && candidate.isEnabled
          );
          const avatar = shareLink ? avatars.get(shareLink.avatarAgentId) : null;

          if (!shareLink || !avatar || avatar.status !== "active") {
            return null;
          }

          return { ...shareLink, avatarAgent: avatar };
        },
      },
    },
    accessGrants: {
      repository: {
        async create(ownerId, avatarAgentId, input: CreateAccessGrantInput) {
          const avatar = avatars.get(avatarAgentId);
          if (!avatar || avatar.ownerId !== ownerId) throw new OwnershipError();

          const participant = Array.from(users.values()).find((user) => user.email === input.email) ?? null;
          if (participant?.id === ownerId) throw new SelfAccessGrantError();
          if (
            Array.from(accessGrants.values()).some(
              (grant) => grant.avatarAgentId === avatarAgentId && grant.participantEmail === input.email
            )
          ) {
            throw { code: "P2002" };
          }

          const now = new Date("2026-05-15T00:00:00.000Z");
          const grant: AccessGrantRecord = {
            id: `access-grant-${accessGrants.size + 1}`,
            ownerId,
            avatarAgentId,
            participantEmail: input.email,
            participantUserId: participant?.id ?? null,
            status: "active",
            revokedAt: null,
            createdAt: now,
            updatedAt: now,
            ...(input.limits ?? {}),
          };
          accessGrants.set(grant.id, grant);
          return grant;
        },
        async listForAvatar(ownerId, avatarAgentId) {
          const avatar = avatars.get(avatarAgentId);
          if (!avatar || avatar.ownerId !== ownerId) throw new OwnershipError();

          return Array.from(accessGrants.values()).filter(
            (grant) => grant.ownerId === ownerId && grant.avatarAgentId === avatarAgentId
          );
        },
        async updateForAvatar(ownerId, avatarAgentId, accessGrantId, input) {
          const grant = accessGrants.get(accessGrantId);
          if (!grant || grant.ownerId !== ownerId || grant.avatarAgentId !== avatarAgentId) {
            throw new OwnershipError();
          }

          const updated: AccessGrantRecord = {
            ...grant,
            status: input.status ?? grant.status,
            revokedAt:
              input.status === undefined
                ? grant.revokedAt
                : input.status === "revoked"
                  ? new Date("2026-05-16T00:00:00.000Z")
                  : null,
            ...(input.limits ?? {}),
            updatedAt: new Date("2026-05-16T00:00:00.000Z"),
          };
          accessGrants.set(accessGrantId, updated);
          return updated;
        },
        async deleteForAvatar(ownerId, avatarAgentId, accessGrantId) {
          const grant = accessGrants.get(accessGrantId);
          if (!grant || grant.ownerId !== ownerId || grant.avatarAgentId !== avatarAgentId) {
            throw new OwnershipError();
          }
          const accessGrant: AccessGrantRecord = {
            ...grant,
            status: "revoked",
            revokedAt: grant.revokedAt ?? new Date("2026-05-17T00:00:00.000Z"),
          };
          accessGrants.set(accessGrantId, accessGrant);
          return { outcome: "revoked" as const, accessGrant };
        },
        linkActiveForUser,
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

async function createAvatar(app: ReturnType<typeof createApp>, cookie: string, name = "YUNI Demo") {
  const response = await app.request("/avatars", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(avatarInput({ name })),
  });
  const body = (await json(response)) as { avatar: { id: string } };

  return body.avatar.id;
}

async function createShareLink(
  app: ReturnType<typeof createApp>,
  cookie: string,
  avatarId: string,
  slug = "demo-link"
) {
  return app.request(`/avatars/${avatarId}/share-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ slug, name: "Demo public link" }),
  });
}

async function createAccessGrant(
  app: ReturnType<typeof createApp>,
  cookie: string,
  avatarId: string,
  email: string
) {
  return app.request(`/avatars/${avatarId}/access-grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ email }),
  });
}

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("@yuni/api share links", () => {
  it("rejects anonymous list and create requests", async () => {
    const app = createApp(createTestDependencies([createUser()]));

    const listResponse = await app.request("/avatars/avatar-1/share-links");
    const createResponse = await app.request("/avatars/avatar-1/share-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "demo-link", name: "Demo public link" }),
    });

    expect(listResponse.status).toBe(401);
    expect(createResponse.status).toBe(401);
  });

  it("creates a share link for an owned avatar without exposing ownerId", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);
    const response = await createShareLink(app, cookie, avatarId);
    const body = (await json(response)) as {
      shareLink: { slug: string; publicUrl: string; ownerId?: string; isEnabled: boolean };
    };

    expect(response.status).toBe(201);
    expect(body.shareLink).toMatchObject({
      slug: "demo-link",
      publicUrl: "http://localhost:3000/a/demo-link",
      isEnabled: true,
      limits: {
        maxSessionDurationSeconds: null,
        maxSessionsPer24Hours: null,
      },
    });
    expect(body.shareLink.ownerId).toBeUndefined();
  });

  it("lists only share links for the owned avatar", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const firstAvatarId = await createAvatar(app, cookie, "First");
    const secondAvatarId = await createAvatar(app, cookie, "Second");

    await createShareLink(app, cookie, firstAvatarId, "first-link");
    await createShareLink(app, cookie, secondAvatarId, "second-link");

    const response = await app.request(`/avatars/${firstAvatarId}/share-links`, {
      headers: { Cookie: cookie },
    });
    const body = (await json(response)) as { shareLinks: Array<{ slug: string }> };

    expect(response.status).toBe(200);
    expect(body.shareLinks).toEqual([expect.objectContaining({ slug: "first-link" })]);
  });

  it("does not create share links for another owner avatar", async () => {
    const app = createApp(
      createTestDependencies([
        createUser({ id: "user-1", email: "demo@yuni.local" }),
        createUser({ id: "user-2", email: "other@yuni.local" }),
      ])
    );
    const ownCookie = await login(app, "demo@yuni.local");
    const otherCookie = await login(app, "other@yuni.local");
    const otherAvatarId = await createAvatar(app, otherCookie);

    const response = await createShareLink(app, ownCookie, otherAvatarId);

    expect(response.status).toBe(404);
  });

  it("rejects duplicate slugs globally", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);

    await createShareLink(app, cookie, avatarId, "demo-link");
    const response = await createShareLink(app, cookie, avatarId, "demo-link");

    expect(response.status).toBe(409);
  });

  it("updates share link name and enabled state", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);
    const createResponse = await createShareLink(app, cookie, avatarId);
    const createBody = (await json(createResponse)) as { shareLink: { id: string } };

    const response = await app.request(`/avatars/${avatarId}/share-links/${createBody.shareLink.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Updated link", isEnabled: false }),
    });
    const body = (await json(response)) as { shareLink: { name: string; isEnabled: boolean } };

    expect(response.status).toBe(200);
    expect(body.shareLink).toMatchObject({ name: "Updated link", isEnabled: false });
  });

  it("creates and updates all share link interaction limits", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);
    const created = await app.request(`/avatars/${avatarId}/share-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        slug: "limited-link",
        name: "Limited",
        limits: {
          maxSessionDurationSeconds: 45,
          maxSessionsPer24Hours: 3,
        },
      }),
    });
    const createdBody = (await json(created)) as { shareLink: { id: string; limits: object } };
    expect(created.status).toBe(201);
    expect(createdBody.shareLink.limits).toEqual({
      maxSessionDurationSeconds: 45,
      maxSessionsPer24Hours: 3,
    });

    const updated = await app.request(`/avatars/${avatarId}/share-links/${createdBody.shareLink.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        limits: {
          maxSessionDurationSeconds: null,
          maxSessionsPer24Hours: 5,
        },
      }),
    });
    expect((await json(updated)) as object).toMatchObject({
      shareLink: {
        limits: {
          maxSessionDurationSeconds: null,
          maxSessionsPer24Hours: 5,
        },
      },
    });
  });

  it("rejects empty or forbidden update payloads", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);
    const createResponse = await createShareLink(app, cookie, avatarId);
    const createBody = (await json(createResponse)) as { shareLink: { id: string } };

    const emptyResponse = await app.request(`/avatars/${avatarId}/share-links/${createBody.shareLink.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    const forbiddenResponse = await app.request(
      `/avatars/${avatarId}/share-links/${createBody.shareLink.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ slug: "changed", ownerId: "attacker", avatarAgentId: "avatar-2" }),
      }
    );

    expect(emptyResponse.status).toBe(400);
    expect(forbiddenResponse.status).toBe(400);
  });

  it("does not update or delete another owner share link", async () => {
    const app = createApp(
      createTestDependencies([
        createUser({ id: "user-1", email: "demo@yuni.local" }),
        createUser({ id: "user-2", email: "other@yuni.local" }),
      ])
    );
    const ownCookie = await login(app, "demo@yuni.local");
    const otherCookie = await login(app, "other@yuni.local");
    const otherAvatarId = await createAvatar(app, otherCookie);
    const createResponse = await createShareLink(app, otherCookie, otherAvatarId);
    const createBody = (await json(createResponse)) as { shareLink: { id: string } };

    const patchResponse = await app.request(
      `/avatars/${otherAvatarId}/share-links/${createBody.shareLink.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownCookie },
        body: JSON.stringify({ name: "Nope" }),
      }
    );
    const deleteResponse = await app.request(
      `/avatars/${otherAvatarId}/share-links/${createBody.shareLink.id}`,
      {
        method: "DELETE",
        headers: { Cookie: ownCookie },
      }
    );

    expect(patchResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });

  it("deletes a share link and removes it from the avatar list", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);
    const createResponse = await createShareLink(app, cookie, avatarId);
    const createBody = (await json(createResponse)) as { shareLink: { id: string } };

    const deleteResponse = await app.request(`/avatars/${avatarId}/share-links/${createBody.shareLink.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    const listResponse = await app.request(`/avatars/${avatarId}/share-links`, {
      headers: { Cookie: cookie },
    });
    const listBody = (await json(listResponse)) as { shareLinks: unknown[] };

    expect(deleteResponse.status).toBe(200);
    expect(await json(deleteResponse)).toEqual({ ok: true });
    expect(listBody.shareLinks).toEqual([]);
  });

  it("resolves an enabled public link with a safe active avatar DTO", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);

    await createShareLink(app, cookie, avatarId, "public-demo");

    const response = await app.request("/public/links/public-demo/avatar", {
      headers: { Cookie: "yuni_session=invalid-but-irrelevant" },
    });
    const body = (await json(response)) as {
      shareLink: { slug: string; name: string; ownerId?: string };
      avatar: {
        name: string;
        description: string;
        thumbnailUrl: string | null;
        instructions?: string;
        context?: string;
        providerAgentId?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body).toEqual({
      shareLink: {
        slug: "public-demo",
        name: "Demo public link",
        limits: {
          maxSessionDurationSeconds: null,
          maxSessionsPer24Hours: null,
        },
      },
      avatar: {
        name: "YUNI Demo",
        description: "Avatar de prueba",
        thumbnailUrl: null,
      },
      capabilities: { voice: "unavailable" },
    });
    expect(body.shareLink.ownerId).toBeUndefined();
    expect(body.avatar.instructions).toBeUndefined();
    expect(body.avatar.context).toBeUndefined();
    expect(body.avatar.providerAgentId).toBeUndefined();
  });

  it("does not resolve disabled, missing or non-active public avatars", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const activeAvatarId = await createAvatar(app, cookie);
    const draftAvatarId = await createAvatar(app, cookie, "Draft avatar");

    await app.request(`/avatars/${draftAvatarId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ status: "draft" }),
    });

    const enabledResponse = await createShareLink(app, cookie, activeAvatarId, "disabled-demo");
    const enabledBody = (await json(enabledResponse)) as { shareLink: { id: string } };
    await app.request(`/avatars/${activeAvatarId}/share-links/${enabledBody.shareLink.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ isEnabled: false }),
    });
    await createShareLink(app, cookie, draftAvatarId, "draft-demo");

    expect((await app.request("/public/links/disabled-demo/avatar")).status).toBe(404);
    expect((await app.request("/public/links/draft-demo/avatar")).status).toBe(404);
    expect((await app.request("/public/links/missing-demo/avatar")).status).toBe(404);
  });
});

describe("@yuni/api access grants", () => {
  it("rejects anonymous grant requests", async () => {
    const app = createApp(createTestDependencies([createUser()]));

    expect((await app.request("/avatars/avatar-1/access-grants")).status).toBe(401);
    expect(
      (
        await app.request("/avatars/avatar-1/access-grants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "guest@yuni.local" }),
        })
      ).status
    ).toBe(401);
  });

  it("normalizes an unknown email and creates a pending grant", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);
    const response = await createAccessGrant(app, cookie, avatarId, "  Guest@YUNI.Local ");
    const body = (await json(response)) as {
      accessGrant: {
        participantEmail: string;
        participantUserId: string | null;
        state: string;
        ownerId?: string;
      };
    };

    expect(response.status).toBe(201);
    expect(body.accessGrant).toMatchObject({
      participantEmail: "guest@yuni.local",
      participantUserId: null,
      state: "pending",
      limits: {
        maxSessionDurationSeconds: null,
        maxSessionsPer24Hours: null,
      },
    });
    expect(body.accessGrant.ownerId).toBeUndefined();
  });

  it("creates and patches limits for an individual access grant", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);
    const created = await app.request(`/avatars/${avatarId}/access-grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        email: "limited@yuni.local",
        limits: {
          maxSessionDurationSeconds: 45,
          maxSessionsPer24Hours: 2,
        },
      }),
    });
    const createdBody = (await json(created)) as { accessGrant: { id: string; limits: object } };
    expect(created.status).toBe(201);
    expect(createdBody.accessGrant.limits).toEqual({
      maxSessionDurationSeconds: 45,
      maxSessionsPer24Hours: 2,
    });

    const updated = await app.request(`/avatars/${avatarId}/access-grants/${createdBody.accessGrant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        limits: {
          maxSessionDurationSeconds: null,
          maxSessionsPer24Hours: 5,
        },
      }),
    });
    expect(updated.status).toBe(200);
    expect(await json(updated)).toMatchObject({
      accessGrant: {
        id: createdBody.accessGrant.id,
        state: "pending",
        limits: {
          maxSessionDurationSeconds: null,
          maxSessionsPer24Hours: 5,
        },
      },
    });
  });

  it("links an existing account and rejects duplicate or self grants", async () => {
    const app = createApp(
      createTestDependencies([createUser(), createUser({ id: "user-2", email: "guest@yuni.local" })])
    );
    const cookie = await login(app);
    const avatarId = await createAvatar(app, cookie);
    const linked = await createAccessGrant(app, cookie, avatarId, "guest@yuni.local");
    const linkedBody = (await json(linked)) as {
      accessGrant: { participantUserId: string | null; state: string };
    };

    expect(linkedBody.accessGrant).toMatchObject({
      participantUserId: "user-2",
      state: "linked",
    });
    expect((await createAccessGrant(app, cookie, avatarId, "guest@yuni.local")).status).toBe(409);
    const selfGrant = await createAccessGrant(app, cookie, avatarId, "demo@yuni.local");
    expect(selfGrant.status).toBe(400);
    expect(await json(selfGrant)).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        reason: "SELF_ACCESS_GRANT",
      },
    });
  });

  it("revokes, reactivates and removes shared avatar access", async () => {
    const app = createApp(
      createTestDependencies([createUser(), createUser({ id: "user-2", email: "guest@yuni.local" })])
    );
    const ownerCookie = await login(app);
    const guestCookie = await login(app, "guest@yuni.local");
    const avatarId = await createAvatar(app, ownerCookie);
    const createResponse = await createAccessGrant(app, ownerCookie, avatarId, "guest@yuni.local");
    const createBody = (await json(createResponse)) as {
      accessGrant: { id: string };
    };

    const sharedBefore = await app.request("/avatars?scope=shared", {
      headers: { Cookie: guestCookie },
    });
    const sharedBeforeBody = (await json(sharedBefore)) as {
      avatars: Array<Record<string, unknown>>;
    };
    expect(sharedBeforeBody.avatars[0]).toMatchObject({
      id: avatarId,
      access: {
        type: "shared",
        canEdit: false,
        canShare: false,
        canInteract: true,
      },
    });
    expect(sharedBeforeBody.avatars[0]).not.toHaveProperty("instructions");
    expect(sharedBeforeBody.avatars[0]).not.toHaveProperty("context");
    expect(sharedBeforeBody.avatars[0]).not.toHaveProperty("providerAgentId");

    const grantUrl = `/avatars/${avatarId}/access-grants/${createBody.accessGrant.id}`;
    const revoked = await app.request(grantUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ status: "revoked" }),
    });
    expect(revoked.status).toBe(200);
    expect(
      (
        (await json(revoked)) as {
          accessGrant: { state: string; revokedAt: string | null };
        }
      ).accessGrant
    ).toMatchObject({ state: "revoked", revokedAt: expect.any(String) });

    const sharedAfter = await app.request("/avatars?scope=shared", {
      headers: { Cookie: guestCookie },
    });
    expect(((await json(sharedAfter)) as { avatars: unknown[] }).avatars).toEqual([]);

    const reactivated = await app.request(grantUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ status: "active" }),
    });
    expect(((await json(reactivated)) as { accessGrant: { state: string } }).accessGrant.state).toBe(
      "linked"
    );

    expect(
      (
        await app.request(grantUrl, {
          method: "DELETE",
          headers: { Cookie: ownerCookie },
        })
      ).status
    ).toBe(200);
  });

  it("links a pending grant when the participant registers", async () => {
    const app = createApp(createTestDependencies([createUser()]));
    const ownerCookie = await login(app);
    const avatarId = await createAvatar(app, ownerCookie);
    await createAccessGrant(app, ownerCookie, avatarId, "new-user@yuni.local");

    const registerResponse = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new-user@yuni.local",
        password: "demo-password",
      }),
    });
    const participantCookie = registerResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const sharedResponse = await app.request("/avatars?scope=shared", {
      headers: { Cookie: participantCookie },
    });

    expect(registerResponse.status).toBe(201);
    expect(((await json(sharedResponse)) as { avatars: Array<{ id: string }> }).avatars).toEqual([
      expect.objectContaining({ id: avatarId }),
    ]);
  });

  it("revokes instead of deleting an issued grant", async () => {
    const app = createApp(
      createTestDependencies([createUser(), createUser({ id: "user-2", email: "guest@yuni.local" })])
    );
    const ownerCookie = await login(app);
    const avatarId = await createAvatar(app, ownerCookie);
    const createResponse = await createAccessGrant(app, ownerCookie, avatarId, "guest@yuni.local");
    const grantId = ((await json(createResponse)) as { accessGrant: { id: string } }).accessGrant.id;
    const deleteResponse = await app.request(`/avatars/${avatarId}/access-grants/${grantId}`, {
      method: "DELETE",
      headers: { Cookie: ownerCookie },
    });
    const deleteBody = (await json(deleteResponse)) as { ok: boolean; outcome: string };
    const listResponse = await app.request(`/avatars/${avatarId}/access-grants`, {
      headers: { Cookie: ownerCookie },
    });
    const listBody = (await json(listResponse)) as { accessGrants: Array<{ id: string; state: string }> };

    expect(deleteResponse.status).toBe(200);
    expect(deleteBody).toEqual({ ok: true, outcome: "revoked" });
    expect(listBody.accessGrants).toContainEqual(expect.objectContaining({ id: grantId, state: "revoked" }));
  });
});
