import { describe, expect, it } from "vitest";
import {
  applyGroupAudioGate,
  encodeElevenLabsAgentCommand,
  isAuthorizedSpeechEnd,
  isAuthorizedSpeechStart,
  providerEventSourceId,
  shouldSendGroupUserActivity,
  type GroupMediaElement,
  type LocalFloorAuthorization,
} from "./components/interact/group-call-runtime";

const authorization: LocalFloorAuthorization = {
  turnId: "turn-1",
  avatarId: "avatar-1",
  callEpoch: 3,
  state: "queued",
};

describe("strict group call runtime", () => {
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
});
