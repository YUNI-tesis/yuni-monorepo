"use client";

import type {
  ApiActivityConversation,
  ApiActivityParticipant,
  ApiActivityTranscriptMessage,
} from "./activity-api";
import { apiRequest } from "./http-client";

export type ApiGroupActivityRosterMember = {
  id: string;
  name: string;
  position: number;
};

export type ApiGroupActivityConversation = ApiActivityConversation & {
  resourceKind: "group";
  groupId: string;
  groupName: string;
  roster: ApiGroupActivityRosterMember[];
  activatedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
};

export type ApiGroupActivityTranscriptMessage = ApiActivityTranscriptMessage & {
  speakerAvatarId: string | null;
  speakerName: string | null;
};

export type ApiGroupActivityConversationDetail = Omit<ApiGroupActivityConversation, "messageCount"> & {
  participantEmail: string;
  messages: ApiGroupActivityTranscriptMessage[];
};

export function listGroupActivityParticipants(groupId: string) {
  return apiRequest<{
    group: { id: string; name: string; archived: boolean };
    participants: ApiActivityParticipant[];
  }>(`/avatar-groups/${groupId}/activity/participants`);
}

export function listGroupParticipantActivityConversations(
  groupId: string,
  participantKey: string,
  options: { limit?: number; cursor?: string } = {}
) {
  const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) query.set("cursor", options.cursor);

  return apiRequest<{
    conversations: ApiGroupActivityConversation[];
    nextCursor: string | null;
  }>(`/avatar-groups/${groupId}/activity/participants/${participantKey}/conversations?${query}`);
}

export function getGroupActivityConversation(groupId: string, conversationId: string) {
  return apiRequest<{ conversation: ApiGroupActivityConversationDetail }>(
    `/avatar-groups/${groupId}/activity/conversations/${conversationId}`
  );
}
