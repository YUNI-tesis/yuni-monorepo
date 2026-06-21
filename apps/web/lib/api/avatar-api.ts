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

export function listAvatars() {
  return apiRequest<{ avatars: ApiAvatar[] }>("/avatars");
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

export function listAvatarConversations(avatarId: string) {
  return apiRequest<{ conversations: ApiConversationSummary[] }>(`/avatars/${avatarId}/conversations`);
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
