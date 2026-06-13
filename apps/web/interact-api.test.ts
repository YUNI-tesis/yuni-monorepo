import { afterEach, describe, expect, it, vi } from "vitest";
import { endVoiceSession, listAvatars, startVoiceSession, syncAgentProvider } from "./lib/api/avatar-api";

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
      "http://localhost:4000/avatars",
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
});
