"use client";

import { useCallback, useEffect, useState } from "react";
import { listActivityParticipants, type ApiActivityParticipant } from "../lib/api/activity-api";

export type ActivityParticipantsState = {
  status: "loading" | "ready" | "error";
  data: ApiActivityParticipant[];
  error: string | null;
};

export function useAvatarActivityParticipants(avatarId: string) {
  const [participants, setParticipants] = useState<ActivityParticipantsState>({
    status: "loading",
    data: [],
    error: null,
  });

  const loadParticipants = useCallback(async () => {
    setParticipants((current) => ({ ...current, status: "loading", error: null }));

    try {
      const response = await listActivityParticipants(avatarId);
      setParticipants({ status: "ready", data: response.participants, error: null });
    } catch (error) {
      setParticipants({
        status: "error",
        data: [],
        error: error instanceof Error ? error.message : "No pudimos cargar la actividad.",
      });
    }
  }, [avatarId]);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);

  return { participants, reloadParticipants: loadParticipants };
}
