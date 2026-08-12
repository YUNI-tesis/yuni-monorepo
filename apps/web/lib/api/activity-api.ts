"use client";

import { apiRequest } from "./http-client";

export type ApiActivityParticipantState = "pending" | "linked" | "revoked";

export type ApiActivityParticipant = {
  participantKey: string;
  participantEmail: string;
  participantName: string | null;
  origins: Array<"access_grant" | "public_link">;
  accessState: ApiActivityParticipantState | null;
  totalConversations: number;
  lastActivityAt: string | null;
};

export type ApiActivityConversation = {
  id: string;
  title: string | null;
  mode: "text" | "voice";
  status: "active" | "ended";
  messageCount: number;
  createdAt: string;
  lastMessageAt: string | null;
  origin: "access_grant" | "public_link";
  shareLinkName: string | null;
};

export type ApiActivityTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ApiActivityConversationDetail = Omit<ApiActivityConversation, "messageCount"> & {
  participantEmail: string;
  messages: ApiActivityTranscriptMessage[];
};

export function listActivityParticipants(avatarId: string) {
  return apiRequest<{ participants: ApiActivityParticipant[] }>(`/avatars/${avatarId}/activity/participants`);
}

export function listParticipantActivityConversations(
  avatarId: string,
  participantKey: string,
  options: { limit?: number; cursor?: string } = {}
) {
  const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) query.set("cursor", options.cursor);

  return apiRequest<{
    conversations: ApiActivityConversation[];
    nextCursor: string | null;
  }>(`/avatars/${avatarId}/activity/participants/${participantKey}/conversations?${query}`);
}

export function getActivityConversation(avatarId: string, conversationId: string) {
  return apiRequest<{ conversation: ApiActivityConversationDetail }>(
    `/avatars/${avatarId}/activity/conversations/${conversationId}`
  );
}
