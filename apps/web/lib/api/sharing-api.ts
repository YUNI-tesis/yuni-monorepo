"use client";

import { apiRequest } from "./http-client";

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
};

export type ApiPublicSharedAvatar = {
  shareLink: {
    slug: string;
    name: string;
  };
  avatar: {
    name: string;
    description: string;
    thumbnailUrl: string | null;
  };
};

export type CreateShareLinkRequest = {
  slug: string;
  name: string;
  isEnabled?: boolean;
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
  input: { name?: string; isEnabled?: boolean }
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

export function createAccessGrant(avatarId: string, email: string) {
  return apiRequest<{ accessGrant: ApiAccessGrant }>(`/avatars/${avatarId}/access-grants`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function updateAccessGrant(avatarId: string, accessGrantId: string, status: "active" | "revoked") {
  return apiRequest<{ accessGrant: ApiAccessGrant }>(`/avatars/${avatarId}/access-grants/${accessGrantId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteAccessGrant(avatarId: string, accessGrantId: string) {
  return apiRequest<{ ok: true; outcome: "deleted" | "revoked" }>(
    `/avatars/${avatarId}/access-grants/${accessGrantId}`,
    {
      method: "DELETE",
    }
  );
}

export function getPublicSharedAvatar(slug: string) {
  return apiRequest<ApiPublicSharedAvatar>(`/public/links/${encodeURIComponent(slug)}/avatar`);
}
