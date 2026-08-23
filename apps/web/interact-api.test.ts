import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAvatarConversation,
  endVoiceSession,
  getAvatarInteractionContext,
  getConversation,
  getLatestAvatarConversation,
  listAvatarConversations,
  listAvatars,
  startVoiceSession,
  syncAgentProvider,
} from "./lib/api/avatar-api";
import {
  createAvatarGroup,
  getGroupConversation,
  getGroupScribeToken,
  interruptGroupVoiceSession,
  listGroupConversations,
  startGroupVoiceSession,
  submitGroupTurn,
  reportGroupProviderEvent,
  reportGroupParticipantFailure,
} from "./lib/api/avatar-group-api";

describe("interact API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists avatars with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ avatars: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await listAvatars();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/avatars?scope=all",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("syncs the provider for an avatar", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sync: { providerAgentId: "agent-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await syncAgentProvider("avatar-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/avatars/avatar-1/agent-provider/sync",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });

  it("starts and ends voice sessions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ voiceSession: { realtimeSessionId: "realtime-1" } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ voiceSession: { id: "realtime-1", status: "ended" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await startVoiceSession("avatar-1");
    await endVoiceSession("realtime-1", [{ role: "user", content: "Hola" }]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/avatars/avatar-1/voice-sessions",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/voice-sessions/realtime-1/end",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ transcript: [{ role: "user", content: "Hola" }] }),
      })
    );
  });

  it("loads avatar conversation history and conversation details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversation: { id: "conversation-1", messages: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await listAvatarConversations("avatar-1");
    await getConversation("conversation-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/avatars/avatar-1/conversations",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/conversations/conversation-1",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("loads safe interaction context and completes the conversation contract", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ interactionContext: {}, conversation: null, conversations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await getAvatarInteractionContext("avatar-1");
    await createAvatarConversation("avatar-1", "voice");
    await getLatestAvatarConversation("avatar-1");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["http://localhost:4000/avatars/avatar-1/interaction-context", "GET"],
      ["http://localhost:4000/avatars/avatar-1/conversations", "POST"],
      ["http://localhost:4000/avatars/avatar-1/conversations/latest", "GET"],
    ]);
    expect(fetchMock.mock.calls[1]?.[1].body).toBe(JSON.stringify({ mode: "voice" }));
  });

  it("preserves stable API error reasons", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              reason: "AVATAR_NOT_READY",
              message: "Shared avatar is not ready",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(startVoiceSession("avatar-1")).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      reason: "AVATAR_NOT_READY",
    });
  });

  it("uses authenticated group and turn endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ group: {}, voiceSession: {}, scribe: {}, directive: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAvatarGroup({ name: "Consejo", avatarIds: ["avatar-1", "avatar-2"] });
    await startGroupVoiceSession("group-1");
    await getGroupScribeToken("session-1");
    await submitGroupTurn("session-1", {
      sourceEventId: "scribe-1",
      content: "Hola equipo",
    });
    await reportGroupProviderEvent("session-1", {
      sourceEventId: "rogue-start-1",
      turnId: null,
      avatarId: "avatar-2",
      type: "speak_started",
    });
    await interruptGroupVoiceSession("session-1", "timeout", {
      avatarId: "avatar-1",
      turnId: "turn-1",
    });
    await reportGroupParticipantFailure("session-1", "avatar-2", {
      sourceEventId: "session-stopped:avatar-2:event-1",
      participantAttemptId: "attempt-2",
      reason: "session_stopped",
      expectedTurnId: "turn-2",
    });
    await listGroupConversations();
    await getGroupConversation("conversation-1");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ["http://localhost:4000/avatar-groups", "POST"],
      ["http://localhost:4000/avatar-groups/group-1/voice-sessions", "POST"],
      ["http://localhost:4000/group-voice-sessions/session-1/scribe-token", "POST"],
      ["http://localhost:4000/group-voice-sessions/session-1/turns", "POST"],
      ["http://localhost:4000/group-voice-sessions/session-1/provider-events", "POST"],
      ["http://localhost:4000/group-voice-sessions/session-1/interrupt", "POST"],
      ["http://localhost:4000/group-voice-sessions/session-1/participants/avatar-2/failure", "POST"],
      ["http://localhost:4000/group-conversations", undefined],
      ["http://localhost:4000/group-conversations/conversation-1", undefined],
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.credentials === "include")).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[4]?.[1].body as string)).toMatchObject({
      turnId: null,
      type: "speak_started",
    });
    expect(JSON.parse(fetchMock.mock.calls[5]?.[1].body as string)).toEqual({
      reason: "timeout",
      expectedAvatarId: "avatar-1",
      expectedTurnId: "turn-1",
    });
    expect(JSON.parse(fetchMock.mock.calls[6]?.[1].body as string)).toEqual({
      sourceEventId: "session-stopped:avatar-2:event-1",
      participantAttemptId: "attempt-2",
      reason: "session_stopped",
      expectedTurnId: "turn-2",
    });
  });
});
