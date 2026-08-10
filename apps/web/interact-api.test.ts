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
});
