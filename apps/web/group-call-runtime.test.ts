import { describe, expect, it } from "vitest";
import {
  applyGroupAudioGate,
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
  type LocalTurnLedgerEntry,
} from "./components/interact/group-call-runtime";
import { ApiClientError } from "./lib/api/http-client";

const authorization: LocalFloorAuthorization = {
  turnId: "turn-1",
  avatarId: "avatar-1",
  callEpoch: 3,
  state: "queued",
};

function ledgerEntry(overrides: Partial<LocalTurnLedgerEntry> = {}): LocalTurnLedgerEntry {
  return {
    turnId: "turn-1",
    avatarId: "avatar-1",
    callEpoch: 3,
    participantAttemptId: "attempt-1",
    state: "queued",
    originalResponse: null,
    latestResponse: null,
    responseReceived: false,
    responseKeys: new Set(),
    ...overrides,
  };
}

function responseAttributionInput() {
  const interrupted = ledgerEntry({
    turnId: "interrupted-turn",
    state: "interrupted",
    originalResponse: "Un borrador anterior",
    latestResponse: "Un borrador anterior",
    responseReceived: true,
    commandDispatchedAt: 100,
  });
  const current = ledgerEntry();
  return {
    avatarId: "avatar-1",
    callEpoch: 3,
    participantAttemptId: "attempt-1",
    type: "agent_response_correction" as const,
    response: { text: "Un borrador", originalText: null, responseKeys: [] as string[] },
    authorization,
    ledger: new Map([
      [interrupted.turnId, interrupted],
      [current.turnId, current],
    ]),
    responseTurnIds: new Map([["avatar-1:old-response", interrupted.turnId]]),
  };
}

describe("strict group call runtime", () => {
  it("preserves an explicitly empty provider correction and its generated draft", () => {
    expect(
      parseElevenLabsResponse(
        {
          agent_response_correction_event: {
            corrected_agent_response: "",
            original_agent_response: "El borrador completo",
            event_id: "response-1",
          },
        },
        true
      )
    ).toEqual({ text: "", originalText: "El borrador completo", responseKeys: ["response-1"] });
    expect(parseElevenLabsResponse({ agent_response: "" })).toBeNull();
  });
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

  it("mutes the old owner before unmuting the new owner regardless of map order", () => {
    const muted = new Map([
      ["avatar-A", false],
      ["avatar-B", true],
    ]);
    const changes: Array<{ avatarId: string; value: boolean; audibleCount: number }> = [];
    const element = (avatarId: string): GroupMediaElement => ({
      get muted() {
        return muted.get(avatarId)!;
      },
      set muted(value) {
        muted.set(avatarId, value);
        changes.push({ avatarId, value, audibleCount: [...muted.values()].filter((value) => !value).length });
      },
    });
    // B comes first, so a single-pass implementation briefly exposes both outputs.
    const media = new Map([
      ["avatar-B", element("avatar-B")],
      ["avatar-A", element("avatar-A")],
    ]);

    applyGroupAudioGate(media, "avatar-B");
    expect(changes).toEqual([
      { avatarId: "avatar-A", value: true, audibleCount: 0 },
      { avatarId: "avatar-B", value: false, audibleCount: 1 },
    ]);
    expect(changes.every((change) => change.audibleCount <= 1)).toBe(true);

    changes.length = 0;
    applyGroupAudioGate(media, "avatar-B");
    expect(changes.every((change) => change.audibleCount === 1)).toBe(true);
    expect(changes.filter((change) => change.avatarId === "avatar-B").every((change) => !change.value)).toBe(
      true
    );
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

  it("attributes a delayed keyed correction to the interrupted turn after the connector is reused", () => {
    const input = responseAttributionInput();
    input.response.responseKeys = ["new-delivery-id", "old-response"];
    expect(resolveTurnForAgentResponse(input)).toBe("interrupted-turn");
  });

  it("attributes a correction by its original draft even while a newer turn owns the floor", () => {
    const input = responseAttributionInput();
    expect(
      resolveTurnForAgentResponse({
        ...input,
        response: { ...input.response, originalText: "Un borrador anterior" },
      })
    ).toBe("interrupted-turn");
  });

  it("never assigns a correction without correlation evidence to the current or latest interrupted turn", () => {
    const input = responseAttributionInput();
    expect(resolveTurnForAgentResponse(input)).toBeNull();
    input.response.responseKeys = ["unknown-delivery-id"];
    expect(resolveTurnForAgentResponse(input)).toBeNull();
    input.ledger.delete("interrupted-turn");
    expect(resolveTurnForAgentResponse(input)).toBeNull();
  });

  it("requires a unique draft match unless a known response key disambiguates repeated text", () => {
    const input = responseAttributionInput();
    input.ledger.set(
      "other-interrupted-turn",
      ledgerEntry({
        turnId: "other-interrupted-turn",
        state: "interrupted",
        originalResponse: "Un borrador anterior",
      })
    );
    const response = { ...input.response, originalText: "Un borrador anterior" };
    expect(resolveTurnForAgentResponse({ ...input, response })).toBeNull();
    response.responseKeys = ["old-response"];
    expect(resolveTurnForAgentResponse({ ...input, response })).toBe("interrupted-turn");
  });

  it("drops conflicting response IDs and contradictory original-text attribution", () => {
    const input = responseAttributionInput();
    input.responseTurnIds.set("avatar-1:current-response", "turn-1");
    input.response.responseKeys = ["old-response", "current-response"];
    expect(resolveTurnForAgentResponse(input)).toBeNull();
    expect(
      resolveTurnForAgentResponse({
        ...input,
        response: {
          ...input.response,
          responseKeys: ["current-response"],
          originalText: "Un borrador anterior",
        },
      })
    ).toBeNull();
  });

  it.each([{ callEpoch: 2 }, { participantAttemptId: "retired-attempt" }, { avatarId: "another-avatar" }])(
    "does not revive a known response key outside its current scope: %j",
    (overrides) => {
      const input = responseAttributionInput();
      Object.assign(input.ledger.get("interrupted-turn")!, overrides);
      input.response.responseKeys = ["old-response"];
      expect(resolveTurnForAgentResponse(input)).toBeNull();
      expect(resolveTurnForAgentResponse({ ...input, type: "agent_response" })).toBeNull();
    }
  );

  it("drops an unkeyed response while both the interrupted and new dispatched turns can own it", () => {
    const input = responseAttributionInput();
    Object.assign(input.ledger.get("interrupted-turn")!, {
      responseReceived: false,
      originalResponse: null,
      latestResponse: null,
    });
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response" })).toBeNull();
    input.response.responseKeys = ["old-response"];
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response" })).toBe("interrupted-turn");
  });

  it("does not attribute an unkeyed duplicate interrupted draft to a newer turn", () => {
    const input = responseAttributionInput();
    input.response.text = "Un borrador anterior";
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response" })).toBeNull();
  });

  it("keeps interruption attribution after a locally completed turn is affected by a cancellation race", () => {
    const input = responseAttributionInput();
    Object.assign(input.ledger.get("interrupted-turn")!, { state: "completed", wasInterrupted: true });
    input.response.text = "Un borrador anterior";
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response" })).toBeNull();
    input.response.responseKeys = ["old-response"];
    expect(resolveTurnForAgentResponse(input)).toBe("interrupted-turn");
  });

  it("accepts a new response when the interrupted draft was already captured", () => {
    const input = responseAttributionInput();
    input.response.text = "Respuesta a la nueva intención";
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response" })).toBe("turn-1");
  });

  it("does not block a new response because an earlier preparation never dispatched a command", () => {
    const input = responseAttributionInput();
    Object.assign(input.ledger.get("interrupted-turn")!, {
      responseReceived: false,
      originalResponse: null,
      latestResponse: null,
      commandDispatchedAt: undefined,
    });
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response" })).toBe("turn-1");
  });

  it("ignores unmatched interrupted turns from a replaced connector when attributing a new response", () => {
    const input = responseAttributionInput();
    Object.assign(input.ledger.get("interrupted-turn")!, {
      responseReceived: false,
      participantAttemptId: "retired-attempt",
    });
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response" })).toBe("turn-1");
  });

  it("does not fill an undispatched preparation with an unsolicited or delayed provider response", () => {
    const input = responseAttributionInput();
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response", authorization: null })).toBeNull();
  });

  it("can attribute the sole unresolved dispatched draft after the interrupted floor was released", () => {
    const input = responseAttributionInput();
    Object.assign(input.ledger.get("interrupted-turn")!, {
      responseReceived: false,
      originalResponse: null,
      latestResponse: null,
    });
    expect(resolveTurnForAgentResponse({ ...input, type: "agent_response", authorization: null })).toBe(
      "interrupted-turn"
    );
  });
});
