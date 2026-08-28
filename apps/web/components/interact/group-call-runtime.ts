import type { ApiGroupOrchestrationPhase } from "../../lib/api/avatar-group-api";

export type LocalFloorAuthorization = {
  turnId: string;
  avatarId: string;
  callEpoch: number;
  state: "queued" | "speaking" | "committing";
};

export type GroupMediaElement = Pick<HTMLMediaElement, "muted">;

export type ElevenLabsCommandType = "contextual_update" | "user_activity" | "user_message";

const ISOLATED_GROUP_BARGE_IN_BACKCHANNELS = new Set([
  "si",
  "aja",
  "ok",
  "okay",
  "dale",
  "claro",
  "mmm",
  "eh",
]);

export function applyGroupAudioGate(
  mediaElements: ReadonlyMap<string, GroupMediaElement>,
  ownerAvatarId: string | null
) {
  for (const [avatarId, mediaElement] of mediaElements) {
    mediaElement.muted = avatarId !== ownerAvatarId;
  }
}

export function isAuthorizedSpeechStart(
  authorization: LocalFloorAuthorization | null,
  avatarId: string,
  callEpoch: number
): boolean {
  return (
    authorization?.callEpoch === callEpoch &&
    authorization.avatarId === avatarId &&
    authorization.state === "queued"
  );
}

export function isAuthorizedSpeechEnd(
  authorization: LocalFloorAuthorization | null,
  avatarId: string,
  callEpoch: number
): boolean {
  return (
    authorization?.callEpoch === callEpoch &&
    authorization.avatarId === avatarId &&
    authorization.state === "speaking"
  );
}

export function shouldSendGroupUserActivity(input: {
  phase: ApiGroupOrchestrationPhase;
  floorOwnerAvatarId: string | null;
  avatarId: string;
}) {
  if (input.phase === "deliberating" || input.phase === "ended" || input.phase === "errored") {
    return false;
  }
  return input.floorOwnerAvatarId === null || input.floorOwnerAvatarId !== input.avatarId;
}

export function encodeElevenLabsAgentCommand(
  elevenlabsEventType: ElevenLabsCommandType,
  data: Record<string, string> = {},
  eventId?: string
) {
  return new TextEncoder().encode(
    JSON.stringify({
      event_type: "elevenlabs_agent_command",
      ...(eventId ? { event_id: eventId } : {}),
      elevenlabs_event_type: elevenlabsEventType,
      data,
    })
  );
}

export function providerEventSourceId(input: {
  type: "agent_response" | "agent_response_correction" | "interruption" | "speak_ended" | "speak_started";
  avatarId: string;
  providerEventId: string;
}) {
  return `${input.type}:${input.avatarId}:${input.providerEventId}`;
}

export function isSignificantGroupBargeInTranscript(text: string) {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

  return Boolean(normalized) && !ISOLATED_GROUP_BARGE_IN_BACKCHANNELS.has(normalized);
}
