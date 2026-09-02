import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { OwnershipError } from "@yuni/domain";
import { createAvatarGroupActivityController } from "./domains/activity/group-controller";
import type { AvatarGroupActivityRepository } from "./domains/activity/group-repository";
import { createParticipantKey } from "./domains/activity/service";
import { createCreatorSessionMiddleware, type CreatorSessionEnv } from "./domains/auth/middleware";
import { createSessionToken, SESSION_COOKIE_NAME } from "./domains/auth/session";

const now = new Date("2026-08-31T15:00:00.000Z");
const roster = [
  { id: "avatar-1", name: "Ada", position: 0 },
  { id: "avatar-2", name: "Turing", position: 1 },
];
const relationalRoster = [
  { sourceAvatarId: "avatar-1", name: "Ada histórica", position: 0 },
  { sourceAvatarId: "avatar-2", name: "Turing histórico", position: 1 },
];

function createRepository(): AvatarGroupActivityRepository {
  return {
    async listParticipants(ownerId) {
      if (ownerId !== "owner-1") throw new OwnershipError();
      return {
        group: { id: "group-1", name: "Consejo", deletedAt: null },
        participants: [
          {
            participantEmail: "pending@example.com",
            participantUserId: null,
            participantName: null,
            grantStatus: "active",
            grantCreatedAt: new Date("2026-08-30T10:00:00.000Z"),
            origins: ["access_grant"],
            totalConversations: 0,
            lastActivityAt: null,
          },
          {
            participantEmail: "linked@example.com",
            participantUserId: "participant-1",
            participantName: "Participante",
            grantStatus: "active",
            grantCreatedAt: new Date("2026-08-29T10:00:00.000Z"),
            origins: ["access_grant", "public_link"],
            totalConversations: 2,
            lastActivityAt: now,
          },
          {
            participantEmail: "revoked@example.com",
            participantUserId: "participant-2",
            participantName: null,
            grantStatus: "revoked",
            grantCreatedAt: new Date("2026-08-28T10:00:00.000Z"),
            origins: ["access_grant"],
            totalConversations: 1,
            lastActivityAt: new Date("2026-08-30T15:00:00.000Z"),
          },
        ],
      };
    },
    async listConversations(ownerId, _groupId, participantEmail, options) {
      if (ownerId !== "owner-1" || participantEmail === "missing@example.com") {
        throw new OwnershipError();
      }
      if (options.cursor === "foreign-cursor") {
        return { invalidCursor: true, conversations: [] } as never;
      }
      const records = [3, 2, 1].map((number) => ({
        id: `conversation-${number}`,
        title: `Conversation ${number}`,
        mode: "voice" as const,
        status: "ended" as const,
        visibility: number === 3 ? ("public" as const) : ("private" as const),
        groupShareLink: number === 3 ? { name: "Demo pública" } : null,
        avatarGroupNameSnapshot: "Consejo histórico",
        avatarGroupRosterSnapshot: roster,
        groupParticipantSnapshots: relationalRoster,
        groupVoiceSession: {
          activatedAt: new Date(`2026-08-0${number}T10:00:05.000Z`),
          endedAt: new Date(`2026-08-0${number}T10:05:05.000Z`),
        },
        createdAt: new Date(`2026-08-0${number}T10:00:00.000Z`),
        lastMessageAt: new Date(`2026-08-0${number}T10:05:00.000Z`),
        _count: { messages: number },
      }));
      const start = options.cursor
        ? records.findIndex((conversation) => conversation.id === options.cursor) + 1
        : 0;
      return {
        invalidCursor: false,
        group: {
          id: "group-1",
          name: "Consejo",
          owner: { email: "owner@example.com" },
          deletedAt: null,
        },
        conversations: records.slice(start, start + options.limit + 1),
      } as never;
    },
    async findConversation(ownerId, _groupId, conversationId) {
      if (ownerId !== "owner-1") throw new OwnershipError();
      if (conversationId === "missing") return null;
      return {
        group: {
          id: "group-1",
          name: "Consejo",
          deletedAt: null,
          owner: { email: "owner@example.com" },
        },
        id: conversationId,
        title: "Transcript seguro",
        mode: "voice",
        status: "ended",
        visibility: "private",
        participantEmail: "linked@example.com",
        avatarGroupNameSnapshot: "Consejo histórico",
        avatarGroupRosterSnapshot: roster,
        groupParticipantSnapshots: relationalRoster,
        groupVoiceSession: {
          activatedAt: new Date("2026-08-31T14:50:00.000Z"),
          endedAt: now,
        },
        groupShareLink: null,
        createdAt: now,
        lastMessageAt: now,
        messages: [
          {
            id: "message-1",
            role: "user",
            content: "Pregunta",
            speakerAvatarId: null,
            groupParticipantSnapshot: null,
            createdAt: now,
          },
          {
            id: "message-2",
            role: "assistant",
            content: "Respuesta",
            speakerAvatarId: "avatar-2",
            groupParticipantSnapshot: {
              sourceAvatarId: "avatar-2",
              name: "Turing histórico",
            },
            createdAt: now,
          },
        ],
      } as never;
    },
  } as AvatarGroupActivityRepository;
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
  app.route("/", createAvatarGroupActivityController({ repository }));
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

describe("@yuni/api avatar group activity", () => {
  it("requires authentication and returns owner-scoped participants", async () => {
    const { app, ownerCookie, otherCookie } = await createTestApp();
    expect((await app.request("/avatar-groups/group-1/activity/participants")).status).toBe(401);
    expect(
      (
        await app.request("/avatar-groups/group-1/activity/participants", {
          headers: { Cookie: otherCookie },
        })
      ).status
    ).toBe(404);

    const response = await app.request("/avatar-groups/group-1/activity/participants", {
      headers: { Cookie: ownerCookie },
    });
    const body = (await response.json()) as {
      group: { name: string };
      participants: Array<Record<string, unknown>>;
    };
    expect(response.status).toBe(200);
    expect(body.group.name).toBe("Consejo");
    expect(body.participants).toEqual([
      expect.objectContaining({
        participantKey: createParticipantKey("linked@example.com"),
        accessState: "linked",
        origins: ["access_grant", "public_link"],
      }),
      expect.objectContaining({ accessState: "revoked" }),
      expect.objectContaining({ accessState: "pending", totalConversations: 0 }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(/participantUserId|ownerId|provider/i);
  });

  it("paginates inside the group and rejects a foreign cursor", async () => {
    const { app, ownerCookie } = await createTestApp();
    const key = createParticipantKey("linked@example.com");
    const first = await app.request(
      `/avatar-groups/group-1/activity/participants/${key}/conversations?limit=2`,
      { headers: { Cookie: ownerCookie } }
    );
    await expect(first.json()).resolves.toMatchObject({
      conversations: [
        {
          id: "conversation-3",
          resourceKind: "group",
          roster: [
            { id: "avatar-1", name: "Ada histórica", position: 0 },
            { id: "avatar-2", name: "Turing histórico", position: 1 },
          ],
          durationSeconds: 300,
        },
        { id: "conversation-2", resourceKind: "group", durationSeconds: 300 },
      ],
      nextCursor: "conversation-2",
    });

    const invalid = await app.request(
      `/avatar-groups/group-1/activity/participants/${key}/conversations?cursor=foreign-cursor`,
      { headers: { Cookie: ownerCookie } }
    );
    expect(invalid.status).toBe(400);
  });

  it("returns a safe roster-aware transcript", async () => {
    const { app, ownerCookie } = await createTestApp();
    const response = await app.request("/avatar-groups/group-1/activity/conversations/conversation-1", {
      headers: { Cookie: ownerCookie },
    });
    const body = (await response.json()) as { conversation: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(body.conversation).toMatchObject({
      resourceKind: "group",
      groupName: "Consejo histórico",
      roster: [
        { id: "avatar-1", name: "Ada histórica", position: 0 },
        { id: "avatar-2", name: "Turing histórico", position: 1 },
      ],
      durationSeconds: 600,
      messages: [
        { role: "user", speakerName: null },
        {
          role: "assistant",
          speakerAvatarId: "avatar-2",
          speakerName: "Turing histórico",
        },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(/metadata|system|provider|instructions|context/i);
  });
});
