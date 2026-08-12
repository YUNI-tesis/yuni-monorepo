import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getActivityConversation,
  listActivityParticipants,
  listParticipantActivityConversations,
  type ApiActivityConversation,
} from "./lib/api/activity-api";
import {
  formatActivityConversationTitle,
  formatActivityDate,
  getAvatarActivityTabPath,
  getActivityParticipantPresentation,
  getParticipantActivityPath,
  mergeActivityConversationPages,
} from "./lib/avatar-activity";

function conversation(id: string): ApiActivityConversation {
  return {
    id,
    title: null,
    mode: "voice",
    status: "ended",
    messageCount: 2,
    createdAt: "2026-08-10T15:00:00.000Z",
    lastMessageAt: "2026-08-10T15:05:00.000Z",
    origin: "access_grant",
    shareLinkName: null,
  };
}

describe("avatar activity helpers", () => {
  it("maps every participant state", () => {
    expect(getActivityParticipantPresentation("pending")).toMatchObject({
      label: "Cuenta pendiente",
      tone: "warning",
    });
    expect(getActivityParticipantPresentation("linked")).toMatchObject({
      label: "Cuenta vinculada",
      tone: "success",
    });
    expect(getActivityParticipantPresentation("revoked")).toMatchObject({
      label: "Acceso revocado",
      tone: "danger",
    });
  });

  it("formats activity dates and empty activity", () => {
    expect(formatActivityDate(null)).toBe("Sin actividad");
    expect(formatActivityDate("2026-08-10T15:00:00.000Z")).toContain("2026");
  });

  it("merges cursor pages without duplicate conversations", () => {
    expect(
      mergeActivityConversationPages(
        [conversation("conversation-2"), conversation("conversation-1")],
        [conversation("conversation-1"), conversation("conversation-0")]
      ).map(({ id }) => id)
    ).toEqual(["conversation-2", "conversation-1", "conversation-0"]);
  });

  it("uses a safe fallback title", () => {
    expect(formatActivityConversationTitle({ title: null }, "student@example.com")).toBe(
      "Conversación con student@example.com"
    );
    expect(formatActivityConversationTitle({ title: "  Tema 1 " }, "student@example.com")).toBe("Tema 1");
  });

  it("builds the participant detail and activity return paths", () => {
    expect(getParticipantActivityPath("avatar-1", "p_email-key")).toBe(
      "/avatars/avatar-1/activity/p_email-key"
    );
    expect(getAvatarActivityTabPath("avatar-1")).toBe("/avatars/avatar-1?tab=activity");
  });
});

describe("avatar activity API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the expected owner activity routes and cursor", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ participants: [], conversations: [], nextCursor: null, conversation: {} }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await listActivityParticipants("avatar-1");
    await listParticipantActivityConversations("avatar-1", "p_email-key", {
      limit: 20,
      cursor: "conversation-20",
    });
    await getActivityConversation("avatar-1", "conversation-1");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["http://localhost:4000/avatars/avatar-1/activity/participants", "GET"],
      [
        "http://localhost:4000/avatars/avatar-1/activity/participants/p_email-key/conversations?limit=20&cursor=conversation-20",
        "GET",
      ],
      ["http://localhost:4000/avatars/avatar-1/activity/conversations/conversation-1", "GET"],
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.credentials === "include")).toBe(true);
  });
});
