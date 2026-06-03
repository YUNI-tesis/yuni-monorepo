import type { ApiAvatarLiveAvatarConfig } from "./api/avatar-api";
import type { ApiLiveAvatarOption } from "./api/live-avatar-api";

export const currentLiveAvatarOptionName = "Avatar actual";

type LiveAvatarConfigInput = {
  avatarId: string;
  selectedAvatar?: ApiLiveAvatarOption | null | undefined;
  fallbackDisplayName?: string;
  fallbackThumbnailUrl?: string | null;
};

export function createLiveAvatarConfig({
  avatarId,
  selectedAvatar,
  fallbackDisplayName = "",
  fallbackThumbnailUrl = null,
}: LiveAvatarConfigInput): ApiAvatarLiveAvatarConfig {
  const isCurrentOption = selectedAvatar?.displayName === currentLiveAvatarOptionName;
  const displayName =
    isCurrentOption ? fallbackDisplayName : selectedAvatar?.displayName ?? fallbackDisplayName;
  const thumbnailUrl =
    isCurrentOption ? fallbackThumbnailUrl : selectedAvatar?.thumbnailUrl ?? fallbackThumbnailUrl;
  const config: ApiAvatarLiveAvatarConfig = {
    provider: "liveavatar",
    avatarId,
    mode: isCurrentOption ? "lite" : selectedAvatar?.mode ?? "lite",
    sandbox: isCurrentOption ? true : selectedAvatar?.sandbox ?? true,
  };

  if (displayName) {
    config.displayName = displayName;
  }

  if (thumbnailUrl) {
    config.thumbnailUrl = thumbnailUrl;
  }

  return config;
}
