export type ClientTranscriptEntry = {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
};

export type NormalizedTranscriptEntry = Pick<ClientTranscriptEntry, "role" | "content">;

const DEFAULT_MAX_ENTRIES = 200;
const MAX_CONTENT_LENGTH = 1000;
const MAX_BODY_BYTES = 256 * 1024;
export const KEEPALIVE_MAX_BODY_BYTES = 60 * 1024;

export function normalizeVoiceTranscript(
  transcript: ClientTranscriptEntry[],
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxBodyBytes = MAX_BODY_BYTES
): NormalizedTranscriptEntry[] {
  const normalized: NormalizedTranscriptEntry[] = [];
  const requestedLimit = Number.isFinite(maxEntries) ? Math.floor(maxEntries) : DEFAULT_MAX_ENTRIES;
  const entryLimit = Math.max(0, Math.min(DEFAULT_MAX_ENTRIES, requestedLimit));

  for (const entry of transcript) {
    if (normalized.length >= entryLimit) break;

    const content = sliceWithoutDanglingSurrogate(entry.content.trim(), MAX_CONTENT_LENGTH);
    if (!content) continue;

    const candidate = { role: entry.role, content };
    if (fitsRequestBody([...normalized, candidate], maxBodyBytes)) {
      normalized.push(candidate);
      continue;
    }

    const fittingContent = fitContentWithinBudget(normalized, entry.role, content, maxBodyBytes);
    if (fittingContent) normalized.push({ role: entry.role, content: fittingContent });
    break;
  }

  return normalized;
}

export function transcriptRequestBodyByteLength(transcript: NormalizedTranscriptEntry[]) {
  return new TextEncoder().encode(JSON.stringify({ transcript })).byteLength;
}

function fitsRequestBody(transcript: NormalizedTranscriptEntry[], maxBodyBytes: number) {
  return transcriptRequestBodyByteLength(transcript) <= maxBodyBytes;
}

function fitContentWithinBudget(
  current: NormalizedTranscriptEntry[],
  role: NormalizedTranscriptEntry["role"],
  content: string,
  maxBodyBytes: number
) {
  let lower = 0;
  let upper = content.length;
  let best = "";

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const prefix = sliceWithoutDanglingSurrogate(content, middle).trimEnd();

    if (prefix && fitsRequestBody([...current, { role, content: prefix }], maxBodyBytes)) {
      best = prefix;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }

  return best;
}

function sliceWithoutDanglingSurrogate(value: string, end: number) {
  let sliced = value.slice(0, end);
  const lastCodeUnit = sliced.charCodeAt(sliced.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    sliced = sliced.slice(0, -1);
  }
  return sliced;
}
