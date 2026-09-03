"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiActivityParticipant } from "../lib/api/activity-api";
import { listGroupActivityParticipants } from "../lib/api/group-activity-api";

export type GroupActivityParticipantsState = {
  status: "loading" | "ready" | "error";
  group: { id: string; name: string; archived: boolean } | null;
  data: ApiActivityParticipant[];
  error: string | null;
};

export function useGroupActivityParticipants(groupId: string) {
  const requestId = useRef(0);
  const [participants, setParticipants] = useState<GroupActivityParticipantsState>({
    status: "loading",
    group: null,
    data: [],
    error: null,
  });

  const loadParticipants = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setParticipants((current) => ({ ...current, status: "loading", error: null }));
    try {
      const response = await listGroupActivityParticipants(groupId);
      if (currentRequestId !== requestId.current) return;
      setParticipants({
        status: "ready",
        group: response.group,
        data: response.participants,
        error: null,
      });
    } catch (error) {
      if (currentRequestId !== requestId.current) return;
      setParticipants({
        status: "error",
        group: null,
        data: [],
        error: error instanceof Error ? error.message : "No pudimos cargar la actividad.",
      });
    }
  }, [groupId]);

  useEffect(() => {
    void loadParticipants();
    return () => {
      requestId.current += 1;
    };
  }, [loadParticipants]);

  return { participants, reloadParticipants: loadParticipants };
}
