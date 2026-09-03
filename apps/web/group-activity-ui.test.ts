import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGroupActivityConversation,
  listGroupActivityParticipants,
  listGroupParticipantActivityConversations,
  type ApiGroupActivityConversation,
} from "./lib/api/group-activity-api";
import {
  formatGroupRoster,
  getGroupActivityPath,
  getGroupParticipantActivityPath,
  mergeGroupActivityConversationPages,
} from "./lib/group-activity";

function conversation(id: string): ApiGroupActivityConversation {
  return {
    id,
    title: "Mesa de consulta",
    mode: "voice",
    status: "ended",
    messageCount: 4,
    createdAt: "2026-08-10T15:00:00.000Z",
    lastMessageAt: "2026-08-10T15:05:00.000Z",
    origin: "access_grant",
    shareLinkName: null,
    resourceKind: "group",
    groupId: "group-1",
    groupName: "Consejo",
    roster: [
      { id: "avatar-2", name: "Turing", position: 1 },
      { id: "avatar-1", name: "Ada", position: 0 },
    ],
    activatedAt: "2026-08-10T15:00:05.000Z",
    endedAt: "2026-08-10T15:05:05.000Z",
    durationSeconds: 300,
  };
}

describe("group activity helpers", () => {
  it("builds encoded group and participant deep links", () => {
    expect(getGroupActivityPath("group 1")).toBe("/groups/group%201/activity");
    expect(getGroupParticipantActivityPath("group 1", "p/person")).toBe(
      "/groups/group%201/activity/p%2Fperson"
    );
  });

  it("keeps one conversation per cursor page and presents the historical roster in order", () => {
    expect(
      mergeGroupActivityConversationPages(
        [conversation("conversation-2"), conversation("conversation-1")],
        [conversation("conversation-1"), conversation("conversation-0")]
      ).map(({ id }) => id)
    ).toEqual(["conversation-2", "conversation-1", "conversation-0"]);
    expect(formatGroupRoster(conversation("conversation-1").roster)).toBe("Ada, Turing");
  });
});

describe("group activity API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses owner-only group activity routes and preserves the cursor", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            group: { id: "group-1", name: "Consejo" },
            participants: [],
            conversations: [],
            nextCursor: null,
            conversation: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    await listGroupActivityParticipants("group-1");
    await listGroupParticipantActivityConversations("group-1", "p_email-key", {
      limit: 20,
      cursor: "conversation-20",
    });
    await getGroupActivityConversation("group-1", "conversation-1");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["/api/avatar-groups/group-1/activity/participants", "GET"],
      [
        "/api/avatar-groups/group-1/activity/participants/p_email-key/conversations?limit=20&cursor=conversation-20",
        "GET",
      ],
      ["/api/avatar-groups/group-1/activity/conversations/conversation-1", "GET"],
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.credentials === "include")).toBe(true);
  });
});
