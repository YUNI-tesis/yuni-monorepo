import type { VoiceSessionTranscriptEntry } from "./api/avatar-api";

type TranscriptEntry = VoiceSessionTranscriptEntry & { id: string };
type Response = {
  original: string;
  confirmed?: boolean;
  corrected?: string;
  transcriptId?: string;
};

// The connector's event UUID is different from the inner ElevenLabs response ID.
// Associate the two streams only when the original text identifies one response.
export function createLiveAvatarTranscript() {
  let entries: TranscriptEntry[] = [];
  const seen = new Set<string>();
  const responses = new Map<string, Response>();
  const correctedEntries = new Set<string>();
  const unidentifiedCorrections = new Set<string>();

  function applyCorrection(id: string, corrected: string) {
    if (correctedEntries.has(id)) return;
    correctedEntries.add(id);
    entries = entries.flatMap((entry) =>
      entry.id !== id
        ? [entry]
        : corrected.trim().length === 0
          ? []
          : [{ ...entry, content: corrected, metadata: { ...entry.metadata, interrupted: true } }]
    );
  }

  function reconcile() {
    const boundIds = new Set([...responses.values()].map((response) => response.transcriptId));
    for (const [eventId, response] of responses) {
      if (!response.transcriptId) {
        if (
          !response.confirmed &&
          (unidentifiedCorrections.has(response.original) ||
            [...responses.values()].some(
              (other) => other !== response && other.original === response.original
            ))
        )
          continue;
        const candidates = entries.filter(
          (entry) =>
            entry.role === "assistant" &&
            !boundIds.has(entry.id) &&
            !correctedEntries.has(entry.id) &&
            entry.content === response.original
        );
        const competingResponses = [...responses.values()].filter(
          (other) => !other.transcriptId && other.original === response.original
        );
        if (candidates.length !== 1 || competingResponses.length !== 1) continue;
        response.transcriptId = candidates[0]!.id;
        boundIds.add(response.transcriptId);
        entries = entries.map((entry) =>
          entry.id === response.transcriptId
            ? { ...entry, metadata: { ...entry.metadata, elevenLabsEventId: eventId } }
            : entry
        );
      }
      if (response.corrected !== undefined) {
        applyCorrection(response.transcriptId, response.corrected);
      }
    }
  }

  return {
    append(entry: TranscriptEntry) {
      if (seen.has(entry.id)) return null;
      seen.add(entry.id);
      entries = [...entries, entry];
      reconcile();
      return entries;
    },
    observeElevenLabs(eventType: string, data: Record<string, unknown>) {
      const isCorrection = eventType === "agent_response_correction";
      if (!isCorrection && eventType !== "agent_response") return null;
      const payload = readRecord(data[`${eventType}_event`]);
      if (!payload) return null;
      const original = isCorrection ? payload.original_agent_response : payload.agent_response;
      const corrected = payload.corrected_agent_response;
      if (typeof original !== "string" || !original.length) return null;
      if (isCorrection && typeof corrected !== "string") return null;

      const previous = entries;
      const eventId = readResponseId(payload.event_id);
      if (payload.event_id !== undefined && eventId === null) return null;
      if (eventId !== null) {
        const response = responses.get(eventId);
        if (response && response.original !== original) return null;
        // A correction is terminal for a response; duplicate/stale deliveries
        // must not re-expand truncated text or affect a later turn.
        if (isCorrection && response?.corrected !== undefined) return null;
        responses.set(eventId, {
          ...response,
          original,
          ...(!isCorrection ? { confirmed: true } : {}),
          ...(isCorrection ? { corrected: corrected as string } : {}),
        });
        reconcile();
      } else if (isCorrection) {
        // Older payloads omit event_id. Never guess "the latest assistant".
        const matches = entries.filter((entry) => entry.role === "assistant" && entry.content === original);
        const alreadyCorrected =
          unidentifiedCorrections.has(original) ||
          [...responses.values()].some(
            (response) => response.original === original && response.corrected !== undefined
          );
        if (matches.length === 1 && !alreadyCorrected) {
          unidentifiedCorrections.add(original);
          applyCorrection(matches[0]!.id, corrected as string);
        }
      }
      return entries === previous ? null : entries;
    },
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readResponseId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === "string" && /^\d+$/.test(value) ? value : null;
}
