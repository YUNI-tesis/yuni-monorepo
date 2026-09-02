import { describe, expect, it } from "vitest";
import {
  applyGroupAudioGate,
  encodeElevenLabsAgentCommand,
  isAuthorizedSpeechEnd,
  isAuthorizedSpeechStart,
  isTerminalHeartbeatError,
  parseElevenLabsResponse,
  providerEventSourceId,
  requiresCompleteGroupStartup,
  resolveTurnForAgentResponse,
  shouldSendGroupUserActivity,
  type GroupMediaElement,
  type LocalFloorAuthorization,
} from "./components/interact/group-call-runtime";
import { ApiClientError } from "./lib/api/http-client";

const authorization: LocalFloorAuthorization = {
  turnId: "turn-1",
  avatarId: "avatar-1",
  callEpoch: 3,
  state: "queued",
};

describe("strict group call runtime", () => {
  it("treats a server-terminated group heartbeat as terminal", () => {
    expect(
      isTerminalHeartbeatError(
        new ApiClientError("La llamada ya terminó", 503, "SERVICE_UNAVAILABLE", "GROUP_NOT_READY")
      )
    ).toBe(true);
    expect(
      isTerminalHeartbeatError(
        new ApiClientError("Proveedor temporalmente no disponible", 503, "SERVICE_UNAVAILABLE")
      )
    ).toBe(false);
  });

  it("keeps every participant muted until one owner is authorized", () => {
    const first: GroupMediaElement = { muted: false };
    const second: GroupMediaElement = { muted: false };
    const media = new Map([
      ["avatar-1", first],
      ["avatar-2", second],
    ]);

    applyGroupAudioGate(media, null);
    expect(first.muted).toBe(true);
    expect(second.muted).toBe(true);

    applyGroupAudioGate(media, "avatar-2");
    expect(first.muted).toBe(true);
    expect(second.muted).toBe(false);

    applyGroupAudioGate(media, "avatar-1");
    expect(first.muted).toBe(false);
    expect(second.muted).toBe(true);
  });

  it("accepts starts and ends only in their exact local state and epoch", () => {
    expect(isAuthorizedSpeechStart(authorization, "avatar-1", 3)).toBe(true);
    expect(isAuthorizedSpeechStart(authorization, "avatar-2", 3)).toBe(false);
    expect(isAuthorizedSpeechStart(authorization, "avatar-1", 4)).toBe(false);
    expect(isAuthorizedSpeechEnd(authorization, "avatar-1", 3)).toBe(false);
    expect(isAuthorizedSpeechEnd({ ...authorization, state: "speaking" }, "avatar-1", 3)).toBe(true);
    expect(isAuthorizedSpeechEnd({ ...authorization, state: "committing" }, "avatar-1", 3)).toBe(false);
  });

  it("pings every agent while listening and only non-owners while a turn is active", () => {
    expect(
      shouldSendGroupUserActivity({ phase: "listening", floorOwnerAvatarId: null, avatarId: "avatar-1" })
    ).toBe(true);
    expect(
      shouldSendGroupUserActivity({ phase: "speaking", floorOwnerAvatarId: "avatar-1", avatarId: "avatar-1" })
    ).toBe(false);
    expect(
      shouldSendGroupUserActivity({ phase: "queued", floorOwnerAvatarId: "avatar-1", avatarId: "avatar-2" })
    ).toBe(true);
    expect(
      shouldSendGroupUserActivity({ phase: "deliberating", floorOwnerAvatarId: null, avatarId: "avatar-2" })
    ).toBe(false);
  });

  it("encodes the exact LiveAvatar wrapper, including an empty user_activity data object", () => {
    const decoded = new TextDecoder().decode(encodeElevenLabsAgentCommand("user_activity"));
    expect(JSON.parse(decoded)).toEqual({
      event_type: "elevenlabs_agent_command",
      elevenlabs_event_type: "user_activity",
      data: {},
    });
  });

  it("derives stable provider event ids from provider delivery ids", () => {
    expect(
      providerEventSourceId({
        type: "speak_started",
        avatarId: "avatar-1",
        providerEventId: "provider-event-9",
      })
    ).toBe("speak_started:avatar-1:provider-event-9");
  });

  it("requires an all-or-nothing browser start for every external group channel", () => {
    expect(requiresCompleteGroupStartup("shared", "authenticated")).toBe(true);
    expect(requiresCompleteGroupStartup("shared", "handled")).toBe(true);
    expect(requiresCompleteGroupStartup("owner", "handled")).toBe(true);
    expect(requiresCompleteGroupStartup("owner", "authenticated")).toBe(false);
  });

  it("correlates nested provider responses with the authorized local turn", () => {
    const response = parseElevenLabsResponse({
      payload: {
        event_id: "provider-event-1",
        agent_response: "Primera respuesta",
      },
    });
    expect(response).toEqual({
      text: "Primera respuesta",
      originalText: null,
      responseKeys: ["provider-event-1"],
    });
    expect(
      resolveTurnForAgentResponse({
        avatarId: "avatar-1",
        callEpoch: 3,
        type: "agent_response",
        response: response!,
        authorization,
        ledger: new Map([
          [
            "turn-1",
            {
              turnId: "turn-1",
              avatarId: "avatar-1",
              callEpoch: 3,
              state: "queued",
              originalResponse: null,
              latestResponse: null,
              responseReceived: false,
              responseKeys: new Set(),
            },
          ],
        ]),
        responseTurnIds: new Map(),
      })
    ).toBe("turn-1");
  });
});
