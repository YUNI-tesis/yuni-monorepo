"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getActivityConversation,
  listActivityParticipants,
  listParticipantActivityConversations,
  type ApiActivityConversation,
  type ApiActivityConversationDetail,
  type ApiActivityParticipant,
} from "../lib/api/activity-api";
import { mergeActivityConversationPages } from "../lib/avatar-activity";
import { ApiClientError } from "../lib/api/http-client";

type ParticipantState = {
  status: "loading" | "ready" | "not-found" | "error";
  data: ApiActivityParticipant | null;
  error: string | null;
};

export type ParticipantConversationsState = {
  status: "loading" | "ready" | "error";
  data: ApiActivityConversation[];
  nextCursor: string | null;
  error: string | null;
  isLoadingMore: boolean;
};

type TranscriptState = {
  status: "idle" | "loading" | "ready" | "error";
  conversationId: string | null;
  data: ApiActivityConversationDetail | null;
  error: string | null;
};

const emptyTranscript: TranscriptState = {
  status: "idle",
  conversationId: null,
  data: null,
  error: null,
};

export function useParticipantActivity(avatarId: string, participantKey: string) {
  const router = useRouter();
  const [participant, setParticipant] = useState<ParticipantState>({
    status: "loading",
    data: null,
    error: null,
  });
  const [conversations, setConversations] = useState<ParticipantConversationsState>({
    status: "loading",
    data: [],
    nextCursor: null,
    error: null,
    isLoadingMore: false,
  });
  const [transcript, setTranscript] = useState<TranscriptState>(emptyTranscript);
  const transcriptRequestId = useRef(0);

  const handleUnauthorized = useCallback(
    (error: unknown) => {
      if (error instanceof ApiClientError && error.status === 401) {
        router.push("/auth/login");
        return true;
      }
      return false;
    },
    [router]
  );

  const loadParticipant = useCallback(async () => {
    setParticipant({ status: "loading", data: null, error: null });

    try {
      const response = await listActivityParticipants(avatarId);
      const match = response.participants.find((item) => item.participantKey === participantKey);
      setParticipant(
        match
          ? { status: "ready", data: match, error: null }
          : { status: "not-found", data: null, error: "No encontramos este participante." }
      );
    } catch (error) {
      if (handleUnauthorized(error)) return;
      setParticipant({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "No pudimos cargar el participante.",
      });
    }
  }, [participantKey, avatarId, handleUnauthorized]);

  const loadConversations = useCallback(
    async (options: { cursor?: string; append?: boolean } = {}) => {
      setConversations((current) => ({
        ...current,
        status: options.append ? current.status : "loading",
        error: null,
        isLoadingMore: Boolean(options.append),
      }));

      try {
        const page = await listParticipantActivityConversations(avatarId, participantKey, {
          limit: 20,
          ...(options.cursor ? { cursor: options.cursor } : {}),
        });
        setConversations((current) => ({
          status: "ready",
          data: options.append
            ? mergeActivityConversationPages(current.data, page.conversations)
            : page.conversations,
          nextCursor: page.nextCursor,
          error: null,
          isLoadingMore: false,
        }));
      } catch (error) {
        if (handleUnauthorized(error)) return;
        setConversations((current) => ({
          ...current,
          status: options.append ? current.status : "error",
          error: error instanceof Error ? error.message : "No pudimos cargar las conversaciones.",
          isLoadingMore: false,
        }));
      }
    },
    [participantKey, avatarId, handleUnauthorized]
  );

  useEffect(() => {
    void loadParticipant();
    void loadConversations();
  }, [loadConversations, loadParticipant]);

  async function loadTranscript(conversationId: string) {
    const requestId = ++transcriptRequestId.current;
    setTranscript({ status: "loading", conversationId, data: null, error: null });

    try {
      const response = await getActivityConversation(avatarId, conversationId);
      if (requestId !== transcriptRequestId.current) return;
      setTranscript({ status: "ready", conversationId, data: response.conversation, error: null });
    } catch (error) {
      if (requestId !== transcriptRequestId.current) return;
      if (handleUnauthorized(error)) return;
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
