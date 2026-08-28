"use client";

import { apiRequest } from "./http-client";
import { KEEPALIVE_MAX_BODY_BYTES, normalizeVoiceTranscript, type ClientTranscriptEntry } from "./transcript";

export type ApiInteractionLimits = {
  maxSessionDurationSeconds: number | null;
  maxSessionsPer24Hours: number | null;
};

export type ApiShareLink = {
  id: string;
  avatarAgentId: string;
  slug: string;
  name: string;
  isEnabled: boolean;
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  limits: ApiInteractionLimits;
};

export type ApiAccessGrantState = "pending" | "linked" | "revoked";

export type ApiAccessGrant = {
  id: string;
  avatarAgentId: string;
  participantEmail: string;
  participantUserId: string | null;
  state: ApiAccessGrantState;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  limits: ApiInteractionLimits;
};

export type ApiPublicSharedAvatar = {
  shareLink: {
    slug: string;
    name: string;
    limits: ApiInteractionLimits;
  };
  avatar: {
    name: string;
    description: string;
    thumbnailUrl: string | null;
  };
  capabilities: {
    voice: "ready" | "unavailable";
  };
};

export type ApiPublicIdentity = {
  email: string;
  token: string;
  expiresAt: string;
};

export type ApiPublicSessionStart = {
  publicSession: {
    id: string;
    token: string;
    expiresAt: string;
    maxTranscriptMessages: number;
  };
  voiceSession: {
    conversationId: string;
    realtimeSessionId: string;
    sessionToken: string;
    expiresAt: string;
  };
};

export type CreateShareLinkRequest = {
  slug: string;
  name: string;
  isEnabled?: boolean;
  limits?: ApiInteractionLimits;
};

export function listShareLinks(avatarId: string) {
  return apiRequest<{ shareLinks: ApiShareLink[] }>(`/avatars/${avatarId}/share-links`);
}

export function createShareLink(avatarId: string, input: CreateShareLinkRequest) {
  return apiRequest<{ shareLink: ApiShareLink }>(`/avatars/${avatarId}/share-links`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateShareLink(
  avatarId: string,
  shareLinkId: string,
  input: { name?: string; isEnabled?: boolean; limits?: ApiInteractionLimits }
) {
  return apiRequest<{ shareLink: ApiShareLink }>(`/avatars/${avatarId}/share-links/${shareLinkId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteShareLink(avatarId: string, shareLinkId: string) {
  return apiRequest<{ ok: true }>(`/avatars/${avatarId}/share-links/${shareLinkId}`, {
    method: "DELETE",
  });
}

export function listAccessGrants(avatarId: string) {
  return apiRequest<{ accessGrants: ApiAccessGrant[] }>(`/avatars/${avatarId}/access-grants`);
}

export function createAccessGrant(avatarId: string, email: string, limits?: ApiInteractionLimits) {
  return apiRequest<{ accessGrant: ApiAccessGrant }>(`/avatars/${avatarId}/access-grants`, {
    method: "POST",
    body: JSON.stringify({ email, ...(limits ? { limits } : {}) }),
  });
}

export function updateAccessGrant(
  avatarId: string,
  accessGrantId: string,
  input: { status?: "active" | "revoked"; limits?: ApiInteractionLimits }
) {
  return apiRequest<{ accessGrant: ApiAccessGrant }>(`/avatars/${avatarId}/access-grants/${accessGrantId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAccessGrant(avatarId: string, accessGrantId: string) {
  return apiRequest<{ ok: true; outcome: "revoked" }>(`/avatars/${avatarId}/access-grants/${accessGrantId}`, {
    method: "DELETE",
  });
}

export function getPublicSharedAvatar(slug: string) {
  return apiRequest<ApiPublicSharedAvatar>(`/public/links/${encodeURIComponent(slug)}/avatar`);
}

export function identifyPublicVisitor(slug: string, email: string) {
  return apiRequest<{ identity: ApiPublicIdentity }>(`/public/links/${encodeURIComponent(slug)}/identify`, {
    method: "POST",
    body: JSON.stringify({ email, consent: true }),
  });
}

export function startPublicSession(slug: string, identityToken: string) {
  return apiRequest<ApiPublicSessionStart>(`/public/links/${encodeURIComponent(slug)}/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${identityToken}` },
  });
}

export function confirmPublicSessionStarted(publicSessionId: string, publicSessionToken: string) {
  return apiRequest<{ publicSession: { id: string; status: "active" } }>(
    `/public/sessions/${encodeURIComponent(publicSessionId)}/started`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${publicSessionToken}` },
    }
  );
}

export function failPublicSessionStart(
  publicSessionId: string,
  publicSessionToken: string,
  options: { keepalive?: boolean } = {}
) {
  return apiRequest<{
    publicSession:
      | { id: string; status: "errored" }
      | { id: string; status: "ended"; endedAt: string | null };
  }>(`/public/sessions/${encodeURIComponent(publicSessionId)}/start-failed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${publicSessionToken}` },
    ...(options.keepalive !== undefined ? { keepalive: options.keepalive } : {}),
  });
}

export function endPublicSession(
  publicSessionId: string,
  publicSessionToken: string,
  transcript: Array<{ role: "user" | "assistant"; content: string; metadata?: Record<string, unknown> }>,
  options: { keepalive?: boolean; maxMessages?: number; maxBodyBytes?: number } = {}
) {
  const maxBodyBytes = options.keepalive
    ? Math.min(options.maxBodyBytes ?? KEEPALIVE_MAX_BODY_BYTES, KEEPALIVE_MAX_BODY_BYTES)
    : options.maxBodyBytes;

  return apiRequest<{ publicSession: { id: string; status: string; endedAt: string | null } }>(
    `/public/sessions/${encodeURIComponent(publicSessionId)}/end`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${publicSessionToken}` },
      body: JSON.stringify({
        transcript: normalizePublicTranscript(transcript, options.maxMessages, maxBodyBytes),
      }),
      ...(options.keepalive !== undefined ? { keepalive: options.keepalive } : {}),
    }
  );
}

export function normalizePublicTranscript(
  transcript: ClientTranscriptEntry[],
  maxMessages = 200,
  maxBodyBytes?: number
) {
  return normalizeVoiceTranscript(transcript, maxMessages, maxBodyBytes);
}
