import { DEFAULT_LOCAL_AVATAR, type AgentAvatar } from "@/lib/schemas";
import type {
  AvatarCallContext,
  AvatarOption,
  AvatarSession,
  RealtimeAvatarProvider,
} from "./types";

const LOCAL_AVATARS: AvatarOption[] = [
  {
    id: "local:pennywise",
    provider: "local3d",
    displayName: "Avatar local",
    fallbackModelPath: "/assets/pennywise-rigged.glb",
    isAvailable: true,
  },
  {
    id: "local:santi",
    provider: "local3d",
    displayName: "Santi",
    fallbackModelPath: "/assets/santi-animated.glb",
    isAvailable: true,
  },
  {
    id: "local:angelica",
    provider: "local3d",
    displayName: "Angelica",
    fallbackModelPath: "/assets/angelica.glb",
    isAvailable: true,
  },
];

export const local3dProvider: RealtimeAvatarProvider = {
  id: "local3d",
  label: "Avatar local 3D",
  isRemote: false,
  isConfigured: () => true,
  async listAvatars() {
    return LOCAL_AVATARS;
  },
  async createSession(avatar: AgentAvatar, context: AvatarCallContext): Promise<AvatarSession> {
    return {
      id: `local3d:${context.agentId}:${Date.now()}`,
      provider: "local3d",
      mode: "local",
      metadata: {
        modelPath: avatar.fallbackModelPath || DEFAULT_LOCAL_AVATAR.fallbackModelPath,
      },
    };
  },
};
