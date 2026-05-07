import type { AgentAvatar } from "@/lib/schemas";

export type AvatarProviderId = AgentAvatar["provider"];

export interface AvatarProviderInfo {
  id: AvatarProviderId;
  label: string;
  isRemote: boolean;
  isConfigured: boolean;
}

export interface AvatarProviderUserContext {
  userId: string;
}

export interface AvatarOption {
  id: string;
  provider: AvatarProviderId;
  externalAvatarId?: string;
  displayName: string;
  thumbnailUrl?: string;
  fallbackModelPath?: string;
  quality?: AgentAvatar["quality"];
  isAvailable: boolean;
}

export interface AvatarCallContext {
  userId: string;
  agentId: string;
  conversationId?: string;
}

export interface AvatarSession {
  id: string;
  provider: AvatarProviderId;
  mode: "local" | "remote";
  sessionToken?: string;
  apiUrl?: string;
  avatarId?: string;
  sandboxMode?: boolean;
  externalSessionId?: string;
  sdk?: "liveavatar-web-sdk";
  metadata?: Record<string, unknown>;
}

export interface RealtimeAvatarProvider {
  id: AvatarProviderId;
  label: string;
  isRemote: boolean;
  isConfigured(): boolean;
  listAvatars(context: AvatarProviderUserContext): Promise<AvatarOption[]>;
  createSession(avatar: AgentAvatar, context: AvatarCallContext): Promise<AvatarSession>;
  stopSession?(sessionId: string, reason?: string): Promise<void>;
  getStatus?(): Promise<Record<string, unknown>>;
}
