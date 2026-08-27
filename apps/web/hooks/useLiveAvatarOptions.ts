"use client";

import { useEffect, useMemo, useState } from "react";
import { getLiveAvatarOptions, type ApiLiveAvatarOption } from "../lib/api/live-avatar-api";
import { currentLiveAvatarOptionName } from "../lib/avatar-config";

export type LiveAvatarOptionsState =
  | {
      status: "loading";
      options: ApiLiveAvatarOption[];
      error: null;
    }
  | {
      status: "ready" | "empty";
      options: ApiLiveAvatarOption[];
      error: null;
    }
  | {
      status: "error";
      options: ApiLiveAvatarOption[];
      error: string;
    };

export type UseLiveAvatarOptionsOptions = {
  currentAvatarId?: string | undefined;
  includeCurrentFallback?: boolean;
  enabled?: boolean;
};

export function useLiveAvatarOptions(options: UseLiveAvatarOptionsOptions = {}): LiveAvatarOptionsState {
  const { currentAvatarId, includeCurrentFallback = false, enabled = true } = options;
  const [state, setState] = useState<LiveAvatarOptionsState>({
    status: "loading",
    options: [],
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    if (!enabled) {
      setState({ status: "empty", options: [], error: null });
      return () => {
        isMounted = false;
      };
    }

    setState({ status: "loading", options: [], error: null });

    getLiveAvatarOptions()
      .then(({ avatars }) => {
        if (!isMounted) {
          return;
        }

        setState({
          status: avatars.length > 0 ? "ready" : "empty",
          options: avatars,
          error: null,
        });
      })
      .catch((caughtError) => {
        if (!isMounted) {
          return;
        }

        setState({
          status: "error",
          options: [],
          error: caughtError instanceof Error ? caughtError.message : "No pudimos cargar Live Avatar.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) {
      return { status: "empty", options: [], error: null };
    }

    const resolvedOptions = includeCurrentFallback
      ? withCurrentOption(state.options, currentAvatarId)
      : state.options;

    if (state.status === "loading") {
      return state;
    }

    if (state.status === "error") {
      return {
        ...state,
        options: resolvedOptions,
      };
    }

    return {
      ...state,
      status: resolvedOptions.length > 0 ? "ready" : "empty",
      options: resolvedOptions,
    };
  }, [currentAvatarId, enabled, includeCurrentFallback, state]);
}

export function withCurrentOption(
  options: ApiLiveAvatarOption[],
  currentAvatarId?: string
): ApiLiveAvatarOption[] {
  if (!currentAvatarId || options.some((option) => option.id === currentAvatarId)) {
    return options;
  }

  return [createCurrentOption(currentAvatarId), ...options];
}

export function createCurrentOption(currentAvatarId: string): ApiLiveAvatarOption {
  return {
    id: currentAvatarId,
    displayName: currentLiveAvatarOptionName,
    thumbnailUrl: null,
    provider: "liveavatar",
    mode: "lite",
    sandbox: true,
  };
}
