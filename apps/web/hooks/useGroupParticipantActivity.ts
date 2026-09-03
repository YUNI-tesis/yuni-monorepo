"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiActivityParticipant } from "../lib/api/activity-api";
import {
  getGroupActivityConversation,
  listGroupActivityParticipants,
  listGroupParticipantActivityConversations,
  type ApiGroupActivityConversation,
  type ApiGroupActivityConversationDetail,
} from "../lib/api/group-activity-api";
import { mergeGroupActivityConversationPages } from "../lib/group-activity";

type ParticipantState = {
  status: "loading" | "ready" | "not-found" | "error";
  group: { id: string; name: string } | null;
  data: ApiActivityParticipant | null;
  error: string | null;
};

export type GroupParticipantConversationsState = {
  status: "loading" | "ready" | "error";
  data: ApiGroupActivityConversation[];
  nextCursor: string | null;
  error: string | null;
  isLoadingMore: boolean;
};

type TranscriptState = {
  status: "idle" | "loading" | "ready" | "error";
  conversationId: string | null;
  data: ApiGroupActivityConversationDetail | null;
  error: string | null;
};

const emptyTranscript: TranscriptState = {
  status: "idle",
  conversationId: null,
  data: null,
  error: null,
};

export function useGroupParticipantActivity(groupId: string, participantKey: string) {
  const [participant, setParticipant] = useState<ParticipantState>({
    status: "loading",
    group: null,
    data: null,
    error: null,
  });
  const [conversations, setConversations] = useState<GroupParticipantConversationsState>({
    status: "loading",
    data: [],
    nextCursor: null,
    error: null,
    isLoadingMore: false,
  });
  const [transcript, setTranscript] = useState<TranscriptState>(emptyTranscript);
  const participantRequestId = useRef(0);
  const conversationsRequestId = useRef(0);
  const transcriptRequestId = useRef(0);

  const loadParticipant = useCallback(async () => {
    const requestId = ++participantRequestId.current;
    setParticipant({ status: "loading", group: null, data: null, error: null });
    try {
      const response = await listGroupActivityParticipants(groupId);
      if (requestId !== participantRequestId.current) return;
      const match = response.participants.find((item) => item.participantKey === participantKey);
      setParticipant(
        match
          ? { status: "ready", group: response.group, data: match, error: null }
          : {
              status: "not-found",
              group: response.group,
              data: null,
              error: "No encontramos este participante.",
            }
      );
    } catch (error) {
      if (requestId !== participantRequestId.current) return;
      setParticipant({
        status: "error",
        group: null,
        data: null,
        error: error instanceof Error ? error.message : "No pudimos cargar el participante.",
      });
    }
  }, [groupId, participantKey]);

  const loadConversations = useCallback(
    async (options: { cursor?: string; append?: boolean } = {}) => {
      const requestId = ++conversationsRequestId.current;
      setConversations((current) => ({
        ...current,
        status: options.append ? current.status : "loading",
        error: null,
        isLoadingMore: Boolean(options.append),
      }));

      try {
        const page = await listGroupParticipantActivityConversations(groupId, participantKey, {
          limit: 20,
          ...(options.cursor ? { cursor: options.cursor } : {}),
        });
        if (requestId !== conversationsRequestId.current) return;
        setConversations((current) => ({
          status: "ready",
          data: options.append
            ? mergeGroupActivityConversationPages(current.data, page.conversations)
            : page.conversations,
          nextCursor: page.nextCursor,
          error: null,
          isLoadingMore: false,
        }));
      } catch (error) {
        if (requestId !== conversationsRequestId.current) return;
        setConversations((current) => ({
          ...current,
          status: options.append ? current.status : "error",
          error: error instanceof Error ? error.message : "No pudimos cargar las conversaciones.",
          isLoadingMore: false,
        }));
      }
    },
    [groupId, participantKey]
  );

  useEffect(() => {
    void loadParticipant();
    void loadConversations();
    transcriptRequestId.current += 1;
    setTranscript(emptyTranscript);
    return () => {
      participantRequestId.current += 1;
      conversationsRequestId.current += 1;
      transcriptRequestId.current += 1;
    };
  }, [loadConversations, loadParticipant]);

  async function loadTranscript(conversationId: string) {
    const requestId = ++transcriptRequestId.current;
    setTranscript({ status: "loading", conversationId, data: null, error: null });
    try {
      const response = await getGroupActivityConversation(groupId, conversationId);
      if (requestId !== transcriptRequestId.current) return;
      setTranscript({ status: "ready", conversationId, data: response.conversation, error: null });
    } catch (error) {
      if (requestId !== transcriptRequestId.current) return;
      setTranscript({
        status: "error",
        conversationId,
        data: null,
        error: error instanceof Error ? error.message : "No pudimos cargar el transcript.",
      });
    }
  }

  function loadMore() {
    if (conversations.nextCursor && !conversations.isLoadingMore) {
      void loadConversations({ cursor: conversations.nextCursor, append: true });
    }
  }

  function clearTranscript() {
    transcriptRequestId.current += 1;
    setTranscript(emptyTranscript);
  }

  return {
    participant,
    conversations,
    transcript,
    reloadParticipant: loadParticipant,
    retryConversations: () => loadConversations(),
    loadMore,
    loadTranscript,
    clearTranscript,
  };
}
