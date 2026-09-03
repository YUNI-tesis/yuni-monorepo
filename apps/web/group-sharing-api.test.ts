import { afterEach, describe, expect, it, vi } from "vitest";
import { listAvatarGroups, startGroupVoiceSession } from "./lib/api/avatar-group-api";
import {
  confirmPublicGroupParticipantStarted,
  createGroupAccessGrant,
  createGroupShareLink,
  deleteGroupAccessGrant,
  deleteGroupShareLink,
  endPublicGroupSession,
  getPublicGroupScribeToken,
  getPublicSharedGroup,
  heartbeatPublicGroupSession,
  identifyPublicGroupVisitor,
  interruptPublicGroupSession,
  listGroupAccessGrants,
  listGroupShareLinks,
  reportPublicGroupParticipantFailure,
  reportPublicGroupProviderEvent,
  retryPublicGroupParticipant,
  startPublicGroupSession,
  submitPublicGroupTurn,
  updateGroupAccessGrant,
  updateGroupShareLink,
} from "./lib/api/group-sharing-api";

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: Record<string, unknown> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("group sharing API client", () => {
  it("uses the scoped group catalog and normalizes the legacy member access alias once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        groups: [
          {
            id: "group-1",
            name: "Consejo",
            createdAt: "",
            updatedAt: "",
            membershipVersion: 1,
            access: {
              type: "owner",
              canEdit: true,
              canDelete: true,
              canShare: true,
              canInteract: true,
              limits: null,
              consent: null,
            },
            interactionAvailability: { status: "ready", readyMembers: 2, totalMembers: 2 },
            sharingEligibility: { status: "eligible" },
            members: [
              {
                id: "avatar-1",
                name: "Ada",
                description: "",
                thumbnailUrl: null,
                accessType: "shared",
                position: 0,
                available: true,
              },
            ],
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAvatarGroups("shared");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/avatar-groups?scope=shared",
      expect.objectContaining({ credentials: "include" })
    );
    expect(result.groups[0]).toMatchObject({
      hasActiveSharingChannels: false,
      sharingChannels: { account: true, public: true },
      activityEnabled: false,
      members: [{ viewerAccess: "direct_grant" }],
    });
  });

  it("calls every private group sharing resource with its group-scoped path", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ shareLinks: [], accessGrants: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await listGroupShareLinks("group-1");
    await createGroupShareLink("group-1", { slug: "consejo", name: "Consejo" });
    await updateGroupShareLink("group-1", "link-1", { isEnabled: false });
    await deleteGroupShareLink("group-1", "link-1");
    await listGroupAccessGrants("group-1");
    await createGroupAccessGrant("group-1", "persona@example.com");
    await updateGroupAccessGrant("group-1", "grant-1", { status: "revoked" });
    await deleteGroupAccessGrant("group-1", "grant-1");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["/api/avatar-groups/group-1/share-links", "GET"],
      ["/api/avatar-groups/group-1/share-links", "POST"],
      ["/api/avatar-groups/group-1/share-links/link-1", "PATCH"],
      ["/api/avatar-groups/group-1/share-links/link-1", "DELETE"],
      ["/api/avatar-groups/group-1/access-grants", "GET"],
      ["/api/avatar-groups/group-1/access-grants", "POST"],
      ["/api/avatar-groups/group-1/access-grants/grant-1", "PATCH"],
      ["/api/avatar-groups/group-1/access-grants/grant-1", "DELETE"],
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.credentials === "include")).toBe(true);
  });

  it("sends versioned consent only for an authenticated shared-group start", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ voiceSession: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await startGroupVoiceSession("group-1", {
      consentScopeId: "group-access-grant:grant-1",
      consentVersion: "4",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/avatar-groups/group-1/voice-sessions",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          consentScopeId: "group-access-grant:grant-1",
          consentVersion: "4",
        }),
      })
    );
  });

  it("uses the public group contract and bearer token for the complete runtime", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse({
        identity: {},
        publicSession: {},
        voiceSession: {},
        shareLink: {},
        group: {},
        interactionAvailability: {},
        consent: {},
        scribe: {},
        participant: {},
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getPublicSharedGroup("demo grupal");
    await identifyPublicGroupVisitor("demo grupal", {
      email: "persona@example.com",
      scopeId: "group-share-link:link-1",
      consentVersion: "3",
    });
    await startPublicGroupSession("demo grupal", "identity-token");
    await getPublicGroupScribeToken("session-1", "session-token");
    await submitPublicGroupTurn("session-1", "session-token", {
      sourceEventId: "scribe-1",
      content: "Hola",
    });
    await reportPublicGroupProviderEvent("session-1", "session-token", {
      sourceEventId: "provider-1",
      turnId: null,
      avatarId: "avatar-1",
      type: "speak_started",
    });
    await interruptPublicGroupSession("session-1", "session-token", "user", {
      avatarId: "avatar-1",
      turnId: "turn-1",
    });
    await reportPublicGroupParticipantFailure("session-1", "session-token", "avatar-1", {
      sourceEventId: "failure-1",
      participantAttemptId: "attempt-1",
      reason: "stream_error",
    });
    await confirmPublicGroupParticipantStarted("session-1", "session-token", "avatar-1", "attempt-1");
    await retryPublicGroupParticipant("session-1", "session-token", "avatar-1");
    await heartbeatPublicGroupSession("session-1", "session-token");
    await endPublicGroupSession("session-1", "session-token", "user");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["/api/public/group-links/demo%20grupal", "GET"],
      ["/api/public/group-links/demo%20grupal/identify", "POST"],
      ["/api/public/group-links/demo%20grupal/sessions", "POST"],
      ["/api/public/group-voice-sessions/session-1/scribe-token", "POST"],
      ["/api/public/group-voice-sessions/session-1/turns", "POST"],
      ["/api/public/group-voice-sessions/session-1/provider-events", "POST"],
      ["/api/public/group-voice-sessions/session-1/interrupt", "POST"],
      ["/api/public/group-voice-sessions/session-1/participants/avatar-1/failure", "POST"],
      ["/api/public/group-voice-sessions/session-1/participants/avatar-1/started", "POST"],
      ["/api/public/group-voice-sessions/session-1/participants/avatar-1/retry", "POST"],
      ["/api/public/group-voice-sessions/session-1/heartbeat", "POST"],
      ["/api/public/group-voice-sessions/session-1/end", "POST"],
    ]);
    expect(fetchMock.mock.calls[1]?.[1].body).toBe(
      JSON.stringify({
        email: "persona@example.com",
        scopeId: "group-share-link:link-1",
        consentVersion: "3",
        consent: true,
      })
    );
    for (const [, init] of fetchMock.mock.calls.slice(2)) {
      expect(init.headers).toMatchObject({ Authorization: expect.stringMatching(/Bearer .*token/) });
    }
  });
});
