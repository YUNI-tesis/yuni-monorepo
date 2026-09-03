"use client";

import { apiRequest } from "./http-client";
import type {
  ApiGroupFloorSnapshot,
  ApiGroupOrchestrationResult,
  ApiGroupOrchestrationPhase,
  ApiGroupTurnDirective,
  ApiGroupVoiceParticipant,
  ApiGroupVoiceSession,
  ApiAvatarGroupInteractionAvailability,
} from "./avatar-group-api";
import type { ApiAccessGrantBase, ApiInteractionLimits, ApiShareLinkBase } from "./sharing-api";

export type ApiGroupShareLink = ApiShareLinkBase & { avatarGroupId: string };
export type ApiGroupAccessGrant = ApiAccessGrantBase & {
  avatarGroupId: string;
  consent: { scopeId: string; version: string };
};

export type ApiPublicSharedGroup = {
  shareLink: {
    name: string;
    slug: string;
    limits: ApiInteractionLimits;
  };
  group: {
    name: string;
    members: Array<{
      id: string;
      name: string;
      description: string;
      thumbnailUrl: string | null;
      position: number;
      available: boolean;
    }>;
  };
  interactionAvailability: ApiAvatarGroupInteractionAvailability;
  consent: { scopeId: string; version: string };
};

export type ApiPublicGroupIdentity = {
  email: string;
  token: string;
  expiresAt: string;
  scopeId: string;
  consentVersion: string;
};

export type ApiPublicGroupSessionStart = {
  publicSession: {
    id: string;
    token: string;
    expiresAt: string;
  };
  voiceSession: ApiGroupVoiceSession;
};

export type CreateGroupShareLinkRequest = {
  slug: string;
  name: string;
  isEnabled?: boolean;
  limits?: ApiInteractionLimits;
};

export function listGroupShareLinks(groupId: string) {
  return apiRequest<{ shareLinks: ApiGroupShareLink[] }>(`/avatar-groups/${groupId}/share-links`);
}

export function createGroupShareLink(groupId: string, input: CreateGroupShareLinkRequest) {
  return apiRequest<{ shareLink: ApiGroupShareLink }>(`/avatar-groups/${groupId}/share-links`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGroupShareLink(
  groupId: string,
  shareLinkId: string,
  input: { name?: string; isEnabled?: boolean; limits?: ApiInteractionLimits }
) {
  return apiRequest<{ shareLink: ApiGroupShareLink }>(
    `/avatar-groups/${groupId}/share-links/${shareLinkId}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export function deleteGroupShareLink(groupId: string, shareLinkId: string) {
  return apiRequest<{ ok: true }>(`/avatar-groups/${groupId}/share-links/${shareLinkId}`, {
    method: "DELETE",
  });
}

export function listGroupAccessGrants(groupId: string) {
  return apiRequest<{ accessGrants: ApiGroupAccessGrant[] }>(`/avatar-groups/${groupId}/access-grants`);
}

export function createGroupAccessGrant(groupId: string, email: string, limits?: ApiInteractionLimits) {
  return apiRequest<{ accessGrant: ApiGroupAccessGrant }>(`/avatar-groups/${groupId}/access-grants`, {
    method: "POST",
    body: JSON.stringify({ email, ...(limits ? { limits } : {}) }),
  });
}

export function updateGroupAccessGrant(
  groupId: string,
  accessGrantId: string,
  input: { status?: "active" | "revoked"; limits?: ApiInteractionLimits }
) {
  return apiRequest<{ accessGrant: ApiGroupAccessGrant }>(
    `/avatar-groups/${groupId}/access-grants/${accessGrantId}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export function deleteGroupAccessGrant(groupId: string, accessGrantId: string) {
  return apiRequest<{ ok: true; outcome?: "revoked" }>(
    `/avatar-groups/${groupId}/access-grants/${accessGrantId}`,
    { method: "DELETE" }
  );
}

export function getPublicSharedGroup(slug: string) {
  return apiRequest<ApiPublicSharedGroup>(`/public/group-links/${encodeURIComponent(slug)}`, {
    auth: "none",
  });
}

export function identifyPublicGroupVisitor(
  slug: string,
  input: { email: string; scopeId: string; consentVersion: string }
) {
  return apiRequest<{ identity: ApiPublicGroupIdentity }>(
    `/public/group-links/${encodeURIComponent(slug)}/identify`,
    {
      auth: "none",
      method: "POST",
      body: JSON.stringify({ ...input, consent: true }),
    }
  );
}

export function startPublicGroupSession(slug: string, identityToken: string) {
  return apiRequest<ApiPublicGroupSessionStart>(`/public/group-links/${encodeURIComponent(slug)}/sessions`, {
    auth: "public-token",
    method: "POST",
    headers: { Authorization: `Bearer ${identityToken}` },
  });
}

function publicGroupSessionRequest<T>(
  sessionId: string,
  token: string,
  suffix: string,
  init: RequestInit = {}
) {
  return apiRequest<T>(`/public/group-voice-sessions/${encodeURIComponent(sessionId)}${suffix}`, {
    ...init,
    auth: "public-token",
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
}

export function getPublicGroupScribeToken(sessionId: string, token: string) {
  return publicGroupSessionRequest<{ scribe: { token: string; expiresInSeconds: number } }>(
    sessionId,
    token,
    "/scribe-token",
    { method: "POST" }
  );
}

export function submitPublicGroupTurn(
  sessionId: string,
  token: string,
  input: { sourceEventId: string; content: string }
) {
  return publicGroupSessionRequest<{
    round: { id: string; intent: string; status: string; contextVersion: number } | null;
    phase: ApiGroupOrchestrationPhase;
    directive: ApiGroupTurnDirective | null;
    floor: ApiGroupFloorSnapshot;
  }>(sessionId, token, "/turns", { method: "POST", body: JSON.stringify(input) });
}

export function reportPublicGroupProviderEvent(
  sessionId: string,
  token: string,
  input:
    | { sourceEventId: string; turnId: string | null; avatarId: string; type: "speak_started" }
    | {
        sourceEventId: string;
        turnId: string;
        avatarId: string;
        type: "agent_response" | "agent_response_correction" | "speak_ended" | "interruption";
        content?: string;
      }
) {
  return publicGroupSessionRequest<ApiGroupOrchestrationResult>(sessionId, token, "/provider-events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function interruptPublicGroupSession(
  sessionId: string,
  token: string,
  reason: "user" | "unauthorized_audio" | "timeout" | "participant_error" = "user",
  expected?: { avatarId: string; turnId: string }
) {
  return publicGroupSessionRequest<ApiGroupOrchestrationResult>(sessionId, token, "/interrupt", {
    method: "POST",
    body: JSON.stringify({
      reason,
      ...(expected ? { expectedAvatarId: expected.avatarId, expectedTurnId: expected.turnId } : {}),
    }),
  });
}

export function reportPublicGroupParticipantFailure(
  sessionId: string,
  token: string,
  avatarId: string,
  input: {
    sourceEventId: string;
    participantAttemptId: string;
    reason: "session_stopped" | "stream_error";
    expectedTurnId?: string;
  },
  options: { signal?: AbortSignal } = {}
) {
  return publicGroupSessionRequest<{
    phase: ApiGroupOrchestrationPhase;
    directive: ApiGroupTurnDirective | null;
    floor: ApiGroupFloorSnapshot;
    participant: { avatarId: string; status: "active" | "errored"; error: string | null };
  }>(sessionId, token, `/participants/${encodeURIComponent(avatarId)}/failure`, {
    method: "POST",
    body: JSON.stringify(input),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function confirmPublicGroupParticipantStarted(
  sessionId: string,
  token: string,
  avatarId: string,
  participantAttemptId: string
) {
  return publicGroupSessionRequest<{ ok: true }>(
    sessionId,
    token,
    `/participants/${encodeURIComponent(avatarId)}/started`,
    { method: "POST", body: JSON.stringify({ participantAttemptId }) }
  );
}

export function retryPublicGroupParticipant(sessionId: string, token: string, avatarId: string) {
  return publicGroupSessionRequest<{ participant: ApiGroupVoiceParticipant }>(
    sessionId,
    token,
    `/participants/${encodeURIComponent(avatarId)}/retry`,
    { method: "POST" }
  );
}

export function heartbeatPublicGroupSession(sessionId: string, token: string) {
  return publicGroupSessionRequest<{ ok: true; expiresAt: string }>(sessionId, token, "/heartbeat", {
    method: "POST",
  });
}

export function endPublicGroupSession(
  sessionId: string,
  token: string,
  reason: "user" | "timeout" | "no_participants" | "unload" = "user"
) {
  return publicGroupSessionRequest<{ id: string; status: "ended" }>(sessionId, token, "/end", {
    method: "POST",
    body: JSON.stringify({ reason }),
    keepalive: true,
  });
}
