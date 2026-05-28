"use client";

import { useCallback, useMemo, useState } from "react";

export type LiveAvatarSessionStatus = "idle" | "unavailable" | "error";

export type LiveAvatarSessionState = {
  status: LiveAvatarSessionStatus;
  error: string | null;
};

export function useLiveAvatarSession() {
  const [state, setState] = useState<LiveAvatarSessionState>({
    status: "idle",
    error: null,
  });

  const start = useCallback(() => {
    setState({
      status: "unavailable",
      error: "La sesion Live Avatar se implementa en el modulo realtime.",
    });
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", error: null });
  }, []);

  return useMemo(
    () => ({
      ...state,
      start,
      reset,
    }),
    [reset, start, state]
  );
}
