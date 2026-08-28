"use client";

import { apiRequest } from "./http-client";

export type ApiAvatarGroupMember = {
  id: string;
  name: string;
  description: string;
  thumbnailUrl: string | null;
  accessType: "owner" | "shared";
  position: number;
  available: boolean;
};

export type ApiAvatarGroup = {
  id: string;
  name: string;
  members: ApiAvatarGroupMember[];
  createdAt: string;
  updatedAt: string;
};

export type ApiGroupVoiceParticipant = {
  id: string;
  participantAttemptId: string | null;
  avatar: Pick<ApiAvatarGroupMember, "id" | "name" | "description" | "thumbnailUrl">;
  realtimeSessionId: string;
  status: "active" | "errored";
  sessionToken: string | null;
  sessionId: string | null;
  error: string | null;
};

export type ApiGroupVoiceSession = {
  id: string;
  groupId: string;
  conversationId: string;
  status: "active" | "degraded";
  expiresAt: string;
  participants: ApiGroupVoiceParticipant[];
};

export type ApiGroupTurnDirective =
  | {
      action: "speak";
      turnId: string;
      avatarId: string;
      avatarName: string;
      context: string;
      instruction: string;
      leaseExpiresAt: string;
    }
  | { action: "listen"; reason: string }
  | { action: "interrupt"; avatarId: string; reason: string }
  | {
      action: "suppress";
      avatarId: string;
      reason: "unauthorized_audio" | "invalid_lease";
    };

export type ApiGroupOrchestrationPhase =
  | "listening"
  | "deliberating"
  | "queued"
  | "speaking"
  | "committing"
  | "ended"
  | "errored";

export type ApiGroupFloorSnapshot = {
  turnId: string;
  avatarId: string;
  leaseExpiresAt: string;
} | null;

export type ApiGroupOrchestrationResult = {
  phase: ApiGroupOrchestrationPhase;
  directive: ApiGroupTurnDirective | null;
  floor: ApiGroupFloorSnapshot;
};

export type ApiGroupConversationSummary = {
  id: string;
  title: string | null;
  groupId: string | null;
  groupName: string;
  participants: Array<Pick<ApiAvatarGroupMember, "id" | "name" | "description" | "thumbnailUrl">>;
  messageCount: number;
  status: "active" | "ended";
  lastMessageAt: string | null;
  createdAt: string;
};

export type ApiGroupConversation = {
  id: string;
  title: string | null;
  group: { id: string; name: string } | null;
  participants: ApiGroupConversationSummary["participants"];
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    speakerAvatarId: string | null;
    speakerName: string | null;
    createdAt: string;
  }>;
};

export function listAvatarGroups() {
  return apiRequest<{ groups: ApiAvatarGroup[] }>("/avatar-groups");
}

export function getAvatarGroup(groupId: string) {
  return apiRequest<{ group: ApiAvatarGroup }>(`/avatar-groups/${groupId}`);
}

export function createAvatarGroup(input: { name: string; avatarIds: string[] }) {
  return apiRequest<{ group: ApiAvatarGroup }>("/avatar-groups", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAvatarGroup(groupId: string, input: { name?: string; avatarIds?: string[] }) {
  return apiRequest<{ group: ApiAvatarGroup }>(`/avatar-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAvatarGroup(groupId: string) {
  return apiRequest<{ ok: true }>(`/avatar-groups/${groupId}`, { method: "DELETE" });
}

export function startGroupVoiceSession(groupId: string) {
  return apiRequest<{ voiceSession: ApiGroupVoiceSession }>(`/avatar-groups/${groupId}/voice-sessions`, {
    method: "POST",
  });
}

export function getGroupScribeToken(sessionId: string) {
  return apiRequest<{ scribe: { token: string; expiresInSeconds: number } }>(
    `/group-voice-sessions/${sessionId}/scribe-token`,
    { method: "POST" }
  );
}

export function submitGroupTurn(sessionId: string, input: { sourceEventId: string; content: string }) {
  return apiRequest<{
    round: { id: string; intent: string; status: string; contextVersion: number } | null;
    phase: ApiGroupOrchestrationPhase;
    directive: ApiGroupTurnDirective | null;
    floor: ApiGroupFloorSnapshot;
  }>(`/group-voice-sessions/${sessionId}/turns`, { method: "POST", body: JSON.stringify(input) });
}

export function reportGroupProviderEvent(
  sessionId: string,
  input:
    | {
        sourceEventId: string;
        turnId: string | null;
        avatarId: string;
        type: "speak_started";
      }
    | {
        sourceEventId: string;
        turnId: string;
        avatarId: string;
        type: "agent_response" | "agent_response_correction" | "speak_ended" | "interruption";
        content?: string;
      }
) {
  return apiRequest<ApiGroupOrchestrationResult>(`/group-voice-sessions/${sessionId}/provider-events`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function interruptGroupVoiceSession(
  sessionId: string,
  reason: "user" | "unauthorized_audio" | "timeout" | "participant_error" = "user",
  expected?: { avatarId: string; turnId: string }
) {
  return apiRequest<ApiGroupOrchestrationResult>(`/group-voice-sessions/${sessionId}/interrupt`, {
    method: "POST",
    body: JSON.stringify({
      reason,
      ...(expected ? { expectedAvatarId: expected.avatarId, expectedTurnId: expected.turnId } : {}),
    }),
  });
}

export function reportGroupParticipantFailure(
  sessionId: string,
  avatarId: string,
  input: {
    sourceEventId: string;
    participantAttemptId: string;
    reason: "session_stopped" | "stream_error";
    expectedTurnId?: string;
  },
  options: { signal?: AbortSignal } = {}
) {
  return apiRequest<{
    phase: ApiGroupOrchestrationPhase;
    directive: ApiGroupTurnDirective | null;
    floor: ApiGroupFloorSnapshot;
    participant: { avatarId: string; status: "active" | "errored"; error: string | null };
  }>(`/group-voice-sessions/${sessionId}/participants/${avatarId}/failure`, {
    method: "POST",
    body: JSON.stringify(input),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function confirmGroupParticipantStarted(
  sessionId: string,
  avatarId: string,
  participantAttemptId: string
) {
  return apiRequest<{ ok: true }>(`/group-voice-sessions/${sessionId}/participants/${avatarId}/started`, {
    method: "POST",
    body: JSON.stringify({ participantAttemptId }),
  });
}

export function retryGroupParticipant(sessionId: string, avatarId: string) {
  return apiRequest<{ participant: ApiGroupVoiceParticipant }>(
    `/group-voice-sessions/${sessionId}/participants/${avatarId}/retry`,
    { method: "POST" }
  );
}

export function heartbeatGroupVoiceSession(sessionId: string) {
  return apiRequest<{ ok: true; expiresAt: string }>(`/group-voice-sessions/${sessionId}/heartbeat`, {
    method: "POST",
  });
}

export function endGroupVoiceSession(
  sessionId: string,
  reason: "user" | "timeout" | "no_participants" | "unload" = "user"
) {
  return apiRequest<{ id: string; status: "ended" }>(`/group-voice-sessions/${sessionId}/end`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    keepalive: true,
  });
}

export function listGroupConversations() {
  return apiRequest<{ conversations: ApiGroupConversationSummary[] }>("/group-conversations");
}

export function getGroupConversation(conversationId: string) {
  return apiRequest<{ conversation: ApiGroupConversation }>(`/group-conversations/${conversationId}`);
}
