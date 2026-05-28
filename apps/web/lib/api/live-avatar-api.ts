"use client";

import { apiRequest } from "./http-client";

export type ApiLiveAvatarOption = {
  id: string;
  displayName: string;
  thumbnailUrl: string | null;
  provider: "liveavatar";
  mode: string;
  sandbox: boolean;
};

export function getLiveAvatarOptions() {
  return apiRequest<{ avatars: ApiLiveAvatarOption[] }>("/live-avatar/avatars");
}
