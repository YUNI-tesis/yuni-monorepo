import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { OwnershipError } from "@yuni/domain";
import { createAvatarActivityController } from "./domains/activity/controller";
import type { AvatarActivityRepository } from "./domains/activity/repository";
import { createParticipantKey } from "./domains/activity/service";
import { createCreatorSessionMiddleware, type CreatorSessionEnv } from "./domains/auth/middleware";
import { createSessionToken, SESSION_COOKIE_NAME } from "./domains/auth/session";

const now = new Date("2026-08-10T15:00:00.000Z");

function createRepository(): AvatarActivityRepository {
  return {
    async listParticipants(ownerId) {
      if (ownerId !== "owner-1") throw new OwnershipError();

      return [
        {
          participantEmail: "pending@example.com",
          participantUserId: null,
          participantName: null,
          grantStatus: "active",
          grantCreatedAt: new Date("2026-08-09T10:00:00.000Z"),
          origins: ["access_grant"],
          totalConversations: 0,
          lastActivityAt: null,
        },
        {
          participantEmail: "linked@example.com",
          participantUserId: "participant-1",
          participantName: "Participante",
          grantStatus: "active",
          grantCreatedAt: new Date("2026-08-08T10:00:00.000Z"),
          origins: ["access_grant", "public_link"],
          totalConversations: 2,
          lastActivityAt: now,
        },
        {
          participantEmail: "revoked@example.com",
          participantUserId: "participant-2",
          participantName: null,
          grantStatus: "revoked",
          grantCreatedAt: new Date("2026-08-07T10:00:00.000Z"),
          origins: ["access_grant"],
          totalConversations: 1,
          lastActivityAt: new Date("2026-08-09T15:00:00.000Z"),
        },
      ];
    },
    async listConversations(ownerId, _avatarId, participantEmail, options) {
      if (ownerId !== "owner-1" || participantEmail === "missing@example.com") throw new OwnershipError();
      if (options.cursor === "foreign-cursor") return { invalidCursor: true, conversations: [] };

      const records = [3, 2, 1].map((number) => ({
        id: `conversation-${number}`,
        title: `Conversation ${number}`,
        mode: "voice" as const,
        status: "ended" as const,
        visibility: number === 3 ? ("public" as const) : ("private" as const),
        shareLink: number === 3 ? { name: "Demo pública" } : null,
        createdAt: new Date(`2026-08-0${number}T10:00:00.000Z`),
        lastMessageAt: new Date(`2026-08-0${number}T10:05:00.000Z`),
        _count: { messages: number },
      }));
      const start = options.cursor
        ? records.findIndex((conversation) => conversation.id === options.cursor) + 1
        : 0;

      return {
        invalidCursor: false,
        conversations: records.slice(start, start + options.limit + 1),
      };
    },
    async findConversation(ownerId, _avatarId, conversationId) {
      if (ownerId !== "owner-1") throw new OwnershipError();
      if (conversationId === "missing") return null;

      return {
        id: conversationId,
        title: "Transcript seguro",
        mode: "voice",
        status: "ended",
        visibility: "private",
        participantEmail: "linked@example.com",
        shareLink: null,
        createdAt: now,
        lastMessageAt: now,
        messages:
          conversationId === "empty"
            ? []
            : [
                { id: "message-1", role: "user", content: "Pregunta", createdAt: now },
                { id: "message-2", role: "system", content: "Prompt privado", createdAt: now },
                { id: "message-3", role: "assistant", content: "Respuesta", createdAt: now },
              ],
      };
    },
  };
}

async function createTestApp(repository = createRepository()) {
  const app = new Hono<CreatorSessionEnv>();
  app.use(
    "*",
    createCreatorSessionMiddleware({
      async findPublicById(userId) {
        if (userId !== "owner-1" && userId !== "other-1") return null;
        return {
          id: userId,
          email: userId === "owner-1" ? "owner@example.com" : "other@example.com",
          name: userId === "owner-1" ? "Owner" : "Other",
          imageUrl: null,
          createdAt: now,
          updatedAt: now,
        };
      },
    })
  );
  app.route("/", createAvatarActivityController({ repository }));
  const ownerToken = await createSessionToken({
    id: "owner-1",
    email: "owner@example.com",
    name: "Owner",
  });
  const otherToken = await createSessionToken({
    id: "other-1",
    email: "other@example.com",
    name: "Other",
  });

  return {
    app,
    ownerCookie: `${SESSION_COOKIE_NAME}=${ownerToken}`,
    otherCookie: `${SESSION_COOKIE_NAME}=${otherToken}`,
  };
}

describe("@yuni/api avatar activity", () => {
  it("rejects anonymous requests", async () => {
    const { app } = await createTestApp();
    expect((await app.request("/avatars/avatar-1/activity/participants")).status).toBe(401);
  });

  it("lists linked, revoked and pending participants ordered by activity", async () => {
    const { app, ownerCookie } = await createTestApp();
    const response = await app.request("/avatars/avatar-1/activity/participants", {
      headers: { Cookie: ownerCookie },
    });
    const body = (await response.json()) as { participants: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(body.participants).toEqual([
      expect.objectContaining({
        participantKey: createParticipantKey("linked@example.com"),
        accessState: "linked",
        origins: ["access_grant", "public_link"],
        totalConversations: 2,
      }),
      expect.objectContaining({ accessState: "revoked" }),
      expect.objectContaining({
        accessState: "pending",
        totalConversations: 0,
        lastActivityAt: null,
      }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(/participantUserId|ownerId|provider/i);
  });

  it("hides activity from non-owners", async () => {
    const { app, otherCookie } = await createTestApp();
    const response = await app.request("/avatars/avatar-1/activity/participants", {
      headers: { Cookie: otherCookie },
    });
    expect(response.status).toBe(404);
  });

  it("paginates conversations without duplicates", async () => {
    const { app, ownerCookie } = await createTestApp();
    const firstResponse = await app.request(
      `/avatars/avatar-1/activity/participants/${createParticipantKey("linked@example.com")}/conversations?limit=2`,
      { headers: { Cookie: ownerCookie } }
    );
    const first = (await firstResponse.json()) as {
      conversations: Array<{ id: string }>;
      nextCursor: string | null;
    };
    const secondResponse = await app.request(
      `/avatars/avatar-1/activity/participants/${createParticipantKey("linked@example.com")}/conversations?limit=2&cursor=${first.nextCursor}`,
      { headers: { Cookie: ownerCookie } }
    );
    const second = (await secondResponse.json()) as {
      conversations: Array<{ id: string }>;
      nextCursor: string | null;
    };

    expect(first.conversations.map(({ id }) => id)).toEqual(["conversation-3", "conversation-2"]);
    expect(first.nextCursor).toBe("conversation-2");
    expect(second.conversations.map(({ id }) => id)).toEqual(["conversation-1"]);
    expect(second.nextCursor).toBeNull();
  });

  it("rejects invalid limits and cursors", async () => {
    const { app, ownerCookie } = await createTestApp();
    const invalidLimit = await app.request(
      `/avatars/avatar-1/activity/participants/${createParticipantKey("linked@example.com")}/conversations?limit=100`,
      { headers: { Cookie: ownerCookie } }
    );
    const invalidCursor = await app.request(
      `/avatars/avatar-1/activity/participants/${createParticipantKey("linked@example.com")}/conversations?cursor=foreign-cursor`,
      { headers: { Cookie: ownerCookie } }
    );

    expect(invalidLimit.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
  });

  it("returns 404 for grants and transcripts outside the owned activity", async () => {
    const { app, ownerCookie } = await createTestApp();
    const missingGrant = await app.request(
      "/avatars/avatar-1/activity/participants/p_missing/conversations",
      { headers: { Cookie: ownerCookie } }
    );
    const missingConversation = await app.request("/avatars/avatar-1/activity/conversations/missing", {
      headers: { Cookie: ownerCookie },
    });

    expect(missingGrant.status).toBe(404);
    expect(missingConversation.status).toBe(404);
  });

  it("returns a safe transcript without system messages or metadata", async () => {
    const { app, ownerCookie } = await createTestApp();
    const response = await app.request("/avatars/avatar-1/activity/conversations/conversation-1", {
      headers: { Cookie: ownerCookie },
    });
    const body = (await response.json()) as {
      conversation: { messages: Array<{ role: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.conversation.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
    expect(JSON.stringify(body)).not.toMatch(/metadata|Prompt privado|provider|instructions|context/i);
  });

  it("returns an empty transcript as a valid conversation", async () => {
    const { app, ownerCookie } = await createTestApp();
    const response = await app.request("/avatars/avatar-1/activity/conversations/empty", {
      headers: { Cookie: ownerCookie },
    });
    const body = (await response.json()) as { conversation: { messages: unknown[] } };

    expect(response.status).toBe(200);
    expect(body.conversation.messages).toEqual([]);
  });
});
