"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getGroupConversation,
  listGroupConversations,
  type ApiGroupConversation,
  type ApiGroupConversationSummary,
} from "../../lib/api/avatar-group-api";
import type { CallHistoryLoadStatus } from "./CallExperience";

type GroupConversationHistoryState = {
  summariesStatus: CallHistoryLoadStatus;
  summaries: ApiGroupConversationSummary[];
  summariesError: string | null;
  selectedConversationId: string | null;
  detailStatus: CallHistoryLoadStatus;
  detail: ApiGroupConversation | null;
  detailError: string | null;
};

const initialHistoryState: GroupConversationHistoryState = {
  summariesStatus: "idle",
  summaries: [],
  summariesError: null,
  selectedConversationId: null,
  detailStatus: "idle",
  detail: null,
  detailError: null,
};

export function useGroupCallHistory(groupId: string) {
  const [historyState, setHistoryState] = useState<GroupConversationHistoryState>(initialHistoryState);
  const summariesRequestId = useRef(0);
  const detailRequestId = useRef(0);

  const loadConversation = useCallback(async (conversationId: string) => {
    const requestId = ++detailRequestId.current;
    setHistoryState((current) => ({
      ...current,
      selectedConversationId: conversationId,
      detailStatus: "loading",
      detail: null,
      detailError: null,
    }));
    try {
      const { conversation } = await getGroupConversation(conversationId);
      if (requestId !== detailRequestId.current) return;
      setHistoryState((current) => ({
        ...current,
        selectedConversationId: conversationId,
        detailStatus: "ready",
        detail: conversation,
        detailError: null,
      }));
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      setHistoryState((current) => ({
        ...current,
        selectedConversationId: conversationId,
        detailStatus: "error",
        detail: null,
        detailError: error instanceof Error ? error.message : "No pudimos abrir este chat.",
      }));
    }
  }, []);

  const loadHistory = useCallback(
    async (options: { selectLatest?: boolean } = {}) => {
      const requestId = ++summariesRequestId.current;
      setHistoryState((current) => ({ ...current, summariesStatus: "loading", summariesError: null }));
      try {
        const { conversations } = await listGroupConversations();
        if (requestId !== summariesRequestId.current) return;
        const groupConversations = conversations.filter((conversation) => conversation.groupId === groupId);
        setHistoryState((current) => ({
          ...current,
          summariesStatus: "ready",
          summaries: groupConversations,
          summariesError: null,
          selectedConversationId: groupConversations.some(
            (conversation) => conversation.id === current.selectedConversationId
          )
            ? current.selectedConversationId
            : null,
          detail:
            current.detail &&
            groupConversations.some((conversation) => conversation.id === current.detail?.id)
              ? current.detail
              : null,
        }));
        if (options.selectLatest && groupConversations[0]) {
          void loadConversation(groupConversations[0].id);
        }
      } catch (error) {
        if (requestId !== summariesRequestId.current) return;
        setHistoryState((current) => ({
          ...current,
          summariesStatus: "error",
          summariesError: error instanceof Error ? error.message : "No pudimos cargar el historial.",
        }));
      }
    },
    [groupId, loadConversation]
  );

  useEffect(() => {
    summariesRequestId.current += 1;
    detailRequestId.current += 1;
    setHistoryState(initialHistoryState);
    return () => {
      summariesRequestId.current += 1;
      detailRequestId.current += 1;
    };
  }, [groupId]);

  return { historyState, loadHistory, loadConversation };
}
