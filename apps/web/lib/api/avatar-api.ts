"use client";

import { apiRequest } from "./http-client";

export type ApiAvatarStatus = "draft" | "active" | "disabled";

export type ApiVoiceConfig = {
  provider: "openai" | "elevenlabs";
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
  agentProvider: "elevenlabs_agents" | "openai_realtime" | "none";
  providerAgentId: string | null;
  providerSyncStatus: "not_synced" | "synced" | "failed";
  providerSyncError: string | null;
  providerSyncedAt: string | null;
  providerSyncFingerprint: string | null;
  status: ApiAvatarStatus;
  createdAt: string;
  updatedAt: string;
};

export type ApiAvatarSummary = {
  id: string;
  name: string;
  description: string;
  status: ApiAvatarStatus;
  providerSyncStatus: "not_synced" | "synced" | "failed";
  createdAt: string;
  updatedAt: string;
  access: {
    type: "owner" | "shared";
    canEdit: boolean;
    canShare: boolean;
    canInteract: boolean;
  };
};

export type ApiInteractionContext = {
  avatar: {
    id: string;
    name: string;
    description: string;
    status: ApiAvatarStatus;
  };
  access: {
    type: "owner" | "shared";
    canInteract: boolean;
  };
  contextStatus: "ready" | "processing" | "failed";
  voiceAvailability: "ready" | "processing" | "unavailable";
};

export type AvatarListScope = "all" | "owned" | "shared";

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

export type ApiAgentProviderSync = {
  providerAgentId: string;
  providerSyncFingerprint: string;
  synced: boolean;
};

export type ApiVoiceSession = {
  conversationId: string;
  realtimeSessionId: string;
  providerAgentId: string;
  sessionToken: string;
  sessionId: string | null;
};

export type EndedApiVoiceSession = {
  id: string;
  conversationId: string | null;
  providerSessionId: string | null;
  status: string;
  endedAt: string | null;
};

export type VoiceSessionTranscriptEntry = {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
};

export type ApiConversationMode = "text" | "voice";
export type ApiConversationStatus = "active" | "ended";
export type ApiConversationMessageRole = "user" | "assistant" | "system";

export type ApiConversationSummary = {
  id: string;
  avatarAgentId: string;
  title: string | null;
  mode: ApiConversationMode;
  status: ApiConversationStatus;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiConversationMessage = {
  id: string;
  role: ApiConversationMessageRole;
  content: string;
  metadata: unknown | null;
  createdAt: string;
};

export type ApiConversationDetail = ApiConversationSummary & {
  messages: ApiConversationMessage[];
};

export function listAvatars(scope: AvatarListScope = "all") {
  return apiRequest<{ avatars: ApiAvatarSummary[] }>(`/avatars?scope=${scope}`);
}

export function createAvatar(input: CreateAvatarRequest) {
  return apiRequest<{ avatar: ApiAvatar }>("/avatars", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAvatar(avatarId: string) {
  return apiRequest<{ avatar: ApiAvatar }>(`/avatars/${avatarId}`);
}

export function getAvatarInteractionContext(avatarId: string) {
  return apiRequest<{ interactionContext: ApiInteractionContext }>(
    `/avatars/${avatarId}/interaction-context`
  );
}

export function listAvatarConversations(avatarId: string) {
  return apiRequest<{ conversations: ApiConversationSummary[] }>(`/avatars/${avatarId}/conversations`);
}

export function createAvatarConversation(avatarId: string, mode: ApiConversationMode = "text") {
  return apiRequest<{ conversation: ApiConversationSummary }>(`/avatars/${avatarId}/conversations`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export function getLatestAvatarConversation(avatarId: string) {
  return apiRequest<{ conversation: ApiConversationSummary | null }>(
    `/avatars/${avatarId}/conversations/latest`
  );
}

export function getConversation(conversationId: string) {
  return apiRequest<{ conversation: ApiConversationDetail }>(`/conversations/${conversationId}`);
}

export function updateAvatar(avatarId: string, input: UpdateAvatarRequest) {
  return apiRequest<{ avatar: ApiAvatar }>(`/avatars/${avatarId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function syncAgentProvider(avatarId: string) {
  return apiRequest<{ sync: ApiAgentProviderSync }>(`/avatars/${avatarId}/agent-provider/sync`, {
    method: "POST",
  });
}

export function startVoiceSession(avatarId: string) {
  return apiRequest<{ voiceSession: ApiVoiceSession }>(`/avatars/${avatarId}/voice-sessions`, {
    method: "POST",
  });
}

export function endVoiceSession(realtimeSessionId: string, transcript: VoiceSessionTranscriptEntry[]) {
  return apiRequest<{ voiceSession: EndedApiVoiceSession }>(`/voice-sessions/${realtimeSessionId}/end`, {
    method: "POST",
    body: JSON.stringify({ transcript }),
  });
}
