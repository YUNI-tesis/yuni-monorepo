export const GROUP_SPEECH_END_SETTLE_MS = 1_000;
const MAX_EVENT_IDS = 128;
const MAX_TIMER_MS = 2_147_483_647;

export type GroupSpeechCompletionCandidate = {
  /** Recheck inside the caller's serialized queue, not only when the timer fires. */
  isCurrent(): boolean;
  /** Atomically claim this completion once. Returns false if it became obsolete. */
  consume(): boolean;
};

export type GroupSpeechCompletionBarrier = {
  /** A new start invalidates any pending or already-enqueued completion. */
  start(eventId: string): boolean;
  /** A new end replaces the pending candidate; duplicate deliveries do nothing. */
  end(eventId: string, onReady: (candidate: GroupSpeechCompletionCandidate) => void): boolean;
  /** Invalidate completion without forgetting provider-delivery deduplication. */
  cancel(): void;
  /** Terminal cleanup: invalidate callbacks, clear timers and stop accepting events. */
  dispose(): void;
};

/**
 * A small control-event settling heuristic, not proof of acoustic playback ending.
 * Create one barrier per startup/turn identity; identity and floor-lease checks
 * remain the caller's responsibility. The timer never owns or waits on its queue.
 *
 * onReady should enqueue work. Immediately before committing, that work must check
 * its session/turn identity and call candidate.consume(). A continuation may have
 * invalidated the candidate while the queue was awaiting another HTTP response.
 */
export function createGroupSpeechCompletionBarrier({
  settleMs = GROUP_SPEECH_END_SETTLE_MS,
}: { settleMs?: number } = {}): GroupSpeechCompletionBarrier {
  if (!Number.isFinite(settleMs) || settleMs < 0 || settleMs > MAX_TIMER_MS) {
    throw new RangeError("settleMs must be a finite, non-negative timer duration");
  }

  const eventIds = new Set<string>();
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentCandidate: GroupSpeechCompletionCandidate | null = null;

  const invalidate = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    currentCandidate = null;
  };

  const acceptEvent = (type: "start" | "end", eventId: string) => {
    if (disposed) return false;
    const key = `${type}:${eventId}`;
    if (eventIds.has(key)) return false;
    eventIds.add(key);
    if (eventIds.size > MAX_EVENT_IDS) {
      const oldest = eventIds.values().next().value;
      if (oldest !== undefined) eventIds.delete(oldest);
    }
    return true;
  };

  return {
    start(eventId) {
      if (!acceptEvent("start", eventId)) return false;
      invalidate();
      return true;
    },
    end(eventId, onReady) {
      if (!acceptEvent("end", eventId)) return false;
      invalidate();
      const candidate: GroupSpeechCompletionCandidate = {
        isCurrent: () => !disposed && currentCandidate === candidate,
        consume() {
          if (!candidate.isCurrent()) return false;
          invalidate();
          return true;
        },
      };
      currentCandidate = candidate;
      timer = setTimeout(() => {
        if (!candidate.isCurrent()) return;
        timer = null;
        onReady(candidate);
      }, settleMs);
      return true;
    },
    cancel: invalidate,
    dispose() {
      disposed = true;
      invalidate();
      eventIds.clear();
    },
  };
}
