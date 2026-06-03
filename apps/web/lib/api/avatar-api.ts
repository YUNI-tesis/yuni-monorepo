"use client";

import { apiRequest } from "./http-client";

export type ApiAvatarStatus = "draft" | "active" | "disabled";

export type ApiVoiceConfig = {
  provider: "openai";
  voiceId: string;
  displayName?: string;
  description?: string;
  speakingRate: number;
};

export type ApiAvatarLiveAvatarConfig = {
  provider: "liveavatar";
  avatarId: string;
  displayName?: string;
  thumbnailUrl?: string;
  mode: string;
  sandbox: boolean;
};

export type ApiAvatar = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: unknown;
  liveAvatarConfig: unknown;
  status: ApiAvatarStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateAvatarRequest = {
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: ApiVoiceConfig;
  liveAvatarConfig: ApiAvatarLiveAvatarConfig;
  status: ApiAvatarStatus;
};

export type UpdateAvatarRequest = Partial<CreateAvatarRequest>;

export function createAvatar(input: CreateAvatarRequest) {
  return apiRequest<{ avatar: ApiAvatar }>("/avatars", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAvatar(avatarId: string) {
  return apiRequest<{ avatar: ApiAvatar }>(`/avatars/${avatarId}`);
}

export function updateAvatar(avatarId: string, input: UpdateAvatarRequest) {
  return apiRequest<{ avatar: ApiAvatar }>(`/avatars/${avatarId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
