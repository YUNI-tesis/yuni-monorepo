import type {
  ApiGroupFloorSnapshot,
  ApiGroupOrchestrationPhase,
  ApiGroupTurnDirective,
} from "../../lib/api/avatar-group-api";
import { ApiClientError } from "../../lib/api/http-client";

export type LocalFloorAuthorization = {
  turnId: string;
  avatarId: string;
  callEpoch: number;
  state: "queued" | "speaking" | "committing";
};

export type GroupMediaElement = Pick<HTMLMediaElement, "muted">;

export type ElevenLabsCommandType = "contextual_update" | "user_activity" | "user_message";

export type LocalTurnLedgerEntry = {
  turnId: string;
  avatarId: string;
  callEpoch: number;
  state: "queued" | "speaking" | "completed" | "interrupted";
  originalResponse: string | null;
  latestResponse: string | null;
  responseReceived: boolean;
  responseKeys: Set<string>;
};

export type ParsedElevenLabsResponse = {
  text: string;
  originalText: string | null;
  responseKeys: string[];
};

const MAX_TURN_LEDGER_ENTRIES = 128;

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
  data: Record<string, string> = {}
) {
  return new TextEncoder().encode(
    JSON.stringify({
      event_type: "elevenlabs_agent_command",
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

export function requiresCompleteGroupStartup(
  accessType: "owner" | "shared",
  privacyPrompt: "authenticated" | "handled"
) {
  return accessType === "shared" || privacyPrompt === "handled";
}

export function parseElevenLabsResponse(value: unknown): ParsedElevenLabsResponse | null {
  const text = findNestedString(value, ["corrected_agent_response", "agent_response", "text", "response"]);
  if (!text) return null;
  return {
    text,
    originalText: findNestedString(value, ["original_agent_response"]),
    responseKeys: collectNestedStringValues(value, ["response_id", "event_id"]),
  };
}

export function resolveTurnForAgentResponse(input: {
  avatarId: string;
  callEpoch: number;
  type: "agent_response" | "agent_response_correction";
  response: ParsedElevenLabsResponse;
  authorization: LocalFloorAuthorization | null;
  ledger: Map<string, LocalTurnLedgerEntry>;
  responseTurnIds: Map<string, string>;
}) {
  for (const key of input.response.responseKeys) {
    const turnId = input.responseTurnIds.get(`${input.avatarId}:${key}`);
    if (turnId) return turnId;
  }

  const candidates = [...input.ledger.values()].filter(
    (entry) => entry.avatarId === input.avatarId && entry.callEpoch === input.callEpoch
  );
  if (input.type === "agent_response_correction") {
    if (!input.response.originalText) return null;
    const originalMatches = candidates.filter(
      (entry) =>
        entry.originalResponse === input.response.originalText ||
        entry.latestResponse === input.response.originalText
    );
    return originalMatches.length === 1 ? (originalMatches[0]?.turnId ?? null) : null;
  }

  if (
    input.authorization?.avatarId === input.avatarId &&
    input.authorization.callEpoch === input.callEpoch &&
    input.ledger.has(input.authorization.turnId)
  ) {
    return input.authorization.turnId;
  }

  const unmatched = candidates.filter((entry) => !entry.responseReceived);
  return unmatched.length === 1 ? (unmatched[0]?.turnId ?? null) : null;
}

export function pruneTurnLedger(
  ledger: Map<string, LocalTurnLedgerEntry>,
  responseTurnIds: Map<string, string>
) {
  while (ledger.size > MAX_TURN_LEDGER_ENTRIES) {
    const removable = [...ledger.values()].find(
      (entry) => entry.state === "completed" || entry.state === "interrupted"
    );
    const oldest = removable ?? ledger.values().next().value;
    if (!oldest) return;
    ledger.delete(oldest.turnId);
    for (const key of oldest.responseKeys) responseTurnIds.delete(key);
  }
}

export function speakDirectiveMatchesFloor(
  directive: Extract<ApiGroupTurnDirective, { action: "speak" }>,
  floor: ApiGroupFloorSnapshot
): floor is Exclude<ApiGroupFloorSnapshot, null> {
  return (
    isUsableFloorSnapshot(floor) && floor.turnId === directive.turnId && floor.avatarId === directive.avatarId
  );
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, isCurrent: () => boolean) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          isCurrent()
            ? "La conexión con el avatar tardó demasiado."
            : "El intento de conexión ya no está vigente."
        )
      );
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        if (isCurrent()) resolve(value);
        else reject(new Error("El intento de conexión ya no está vigente."));
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export function withAbortableDeadline<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      onTimeout();
      reject(new Error("La confirmación del fallo del participante agotó el tiempo de espera."));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export function isRetryableParticipantFailure(error: unknown) {
  if (!(error instanceof ApiClientError)) return true;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

export function isTerminalHeartbeatError(error: unknown) {
  if (!(error instanceof ApiClientError)) return false;
  return (
    [401, 404, 409, 410].includes(error.status) ||
    (error.status === 503 && error.reason === "GROUP_NOT_READY")
  );
}

export function isConsentVersionStale(error: unknown) {
  return error instanceof ApiClientError && error.status === 409 && error.reason === "CONSENT_VERSION_STALE";
}

export function isUsableFloorSnapshot(
  floor: ApiGroupFloorSnapshot
): floor is Exclude<ApiGroupFloorSnapshot, null> {
  if (!floor?.leaseExpiresAt.trim()) return false;
  const leaseExpiresAt = new Date(floor.leaseExpiresAt).getTime();
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now();
}

function findNestedString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const nested of Object.values(record)) {
    const candidate = findNestedString(nested, keys);
    if (candidate) return candidate;
  }
  return null;
}

function collectNestedStringValues(value: unknown, keys: string[]) {
  const values = new Set<string>();
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    const record = candidate as Record<string, unknown>;
    for (const [key, nested] of Object.entries(record)) {
      if (keys.includes(key) && typeof nested === "string" && nested.trim()) values.add(nested.trim());
      visit(nested);
    }
  };
  visit(value);
  return [...values];
}
