import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticatedGroupCallTransport, createPublicGroupCallTransport } from "./lib/group-call-transport";
import type { GroupParticipantInterruptionReadyInput } from "./lib/api/avatar-group-api";

afterEach(() => vi.unstubAllGlobals());

const input: GroupParticipantInterruptionReadyInput = {
  interruptionSourceEventId: "human-cut",
  participantAttemptId: "attempt-one",
  interruptedTurnId: "turn-one",
  evidence: { type: "speak_ended", eventId: "terminal-one", speechSourceEventId: "speech-one" },
};
const ready = { applied: true, phase: "listening", directive: null, floor: null };

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("group call interruption readiness transport", () => {
  it("routes authenticated owner and shared sessions to the dedicated acknowledgement endpoint", async () => {
    const fetchMock = vi.fn(async () => response(ready));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      authenticatedGroupCallTransport.confirmParticipantInterruptionReady("session-one", "avatar one", input)
    ).resolves.toEqual(ready);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/group-voice-sessions/session-one/participants/avatar%20one/interruption-ready",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify(input),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the runtime token returned by start for public reuse acknowledgements", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        response({ publicSession: { token: "runtime-token" }, voiceSession: { id: "session-one" } })
      )
      .mockImplementationOnce(async () => response(ready));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createPublicGroupCallTransport({ slug: "demo", identityToken: "identity-token" });
    await transport.start("group-one");
    await expect(
      transport.confirmParticipantInterruptionReady("session-one", "avatar one", input)
    ).resolves.toEqual(ready);

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/public/group-voice-sessions/session-one/participants/avatar%20one/interruption-ready",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
        headers: expect.objectContaining({ Authorization: "Bearer runtime-token" }),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps an acknowledgement from using an identity token before the public session starts", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const transport = createPublicGroupCallTransport({ slug: "demo", identityToken: "identity-token" });

    expect(() => transport.confirmParticipantInterruptionReady("session-one", "avatar-one", input)).toThrow(
      "La sesión pública todavía no está disponible."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
