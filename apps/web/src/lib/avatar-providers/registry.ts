import type { AgentAvatar } from "@/lib/schemas";
import { DEFAULT_LOCAL_AVATAR } from "@/lib/schemas";
import { liveAvatarProvider } from "./liveavatar";
import { local3dProvider } from "./local3d";
import type { AvatarProviderId, AvatarProviderInfo, RealtimeAvatarProvider } from "./types";

const providers: Record<AvatarProviderId, RealtimeAvatarProvider> = {
  local3d: local3dProvider,
  liveavatar: liveAvatarProvider,
};

export function getAvatarProvider(providerId: AvatarProviderId): RealtimeAvatarProvider {
  const provider = providers[providerId];
  if (!provider) {
    throw new Error(`Unsupported avatar provider: ${providerId}`);
  }
  return provider;
}

export function listAvatarProviders(): AvatarProviderInfo[] {
  return Object.values(providers).map((provider) => ({
    id: provider.id,
    label: provider.label,
    isRemote: provider.isRemote,
    isConfigured: provider.isConfigured(),
  }));
}

export function getDefaultAvatarConfig(): AgentAvatar {
  const defaultProvider = process.env.AVATAR_PROVIDER_DEFAULT;
  if (defaultProvider === "liveavatar" && liveAvatarProvider.isConfigured()) {
    return {
      provider: "liveavatar",
      quality: "high",
      fallbackModelPath: DEFAULT_LOCAL_AVATAR.fallbackModelPath,
    };
  }

  return DEFAULT_LOCAL_AVATAR;
}

export function resolveAvatarConfig(avatar?: AgentAvatar | null): AgentAvatar {
  if (!avatar) return getDefaultAvatarConfig();
  if (avatar.provider === "local3d") {
    return {
      ...DEFAULT_LOCAL_AVATAR,
      ...avatar,
      fallbackModelPath: avatar.fallbackModelPath || DEFAULT_LOCAL_AVATAR.fallbackModelPath,
    };
  }
  return {
    ...avatar,
    quality: avatar.quality || "high",
    fallbackModelPath: avatar.fallbackModelPath || DEFAULT_LOCAL_AVATAR.fallbackModelPath,
  };
}
