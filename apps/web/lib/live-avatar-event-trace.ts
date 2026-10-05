export type LiveAvatarTraceEvent =
  | "stream_ready"
  | "user_speech_started"
  | "user_speech_ended"
  | "avatar_speech_started"
  | "avatar_speech_ended"
  | "interruption"
  | "agent_response"
  | "agent_response_correction"
  | "session_stopped";

export type LiveAvatarEventObservation = {
  event: LiveAvatarTraceEvent;
  observedAtMs: number;
  userEndToAvatarStartEventGapMs?: number;
  interruptionToAvatarEndEventGapMs?: number;
};

export const LIVE_AVATAR_TRACE_LIMIT = 80;

// Browser receipt times of provider lifecycle events, not audio measurements.
// Intentionally excludes event payloads, transcripts, tokens, and VAD frames.
export function createLiveAvatarEventTrace(now = () => performance.now()) {
  let observations: LiveAvatarEventObservation[] = [];
  let userEndedAt: number | null = null;
  let interruptedAt: number | null = null;
  let avatarSpeaking = false;

  return (event: LiveAvatarTraceEvent) => {
    const observedAtMs = now();
    const observation: LiveAvatarEventObservation = { event, observedAtMs };
    if (event === "user_speech_started") userEndedAt = null;
    if (event === "user_speech_ended") userEndedAt = observedAtMs;
    if (event === "avatar_speech_started") {
      if (!avatarSpeaking && userEndedAt !== null) {
        observation.userEndToAvatarStartEventGapMs = observedAtMs - userEndedAt;
      }
      userEndedAt = null;
      interruptedAt = null;
      avatarSpeaking = true;
    }
    if (event === "interruption" && avatarSpeaking && interruptedAt === null) {
      interruptedAt = observedAtMs;
    }
    if (event === "avatar_speech_ended") {
      if (interruptedAt !== null) {
        observation.interruptionToAvatarEndEventGapMs = observedAtMs - interruptedAt;
      }
      interruptedAt = null;
      avatarSpeaking = false;
    }
    observations = [...observations, observation].slice(-LIVE_AVATAR_TRACE_LIMIT);
    return observations;
  };
}
