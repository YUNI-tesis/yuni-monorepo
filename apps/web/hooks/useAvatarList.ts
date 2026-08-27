"use client";

import { useEffect, useState } from "react";
import { listAvatars, type ApiAvatarSummary } from "../lib/api/avatar-api";

const avatarListCacheTtlMs = 60_000;

type AvatarListCache = {
  avatars: ApiAvatarSummary[];
  cachedAt: number;
};

let avatarListCache: AvatarListCache | null = null;
let avatarListRequest: Promise<ApiAvatarSummary[]> | null = null;
let avatarListCacheVersion = 0;

export type AvatarListState =
  | { status: "loading"; avatars: ApiAvatarSummary[]; error: null }
  | { status: "ready"; avatars: ApiAvatarSummary[]; error: null }
  | { status: "error"; avatars: ApiAvatarSummary[]; error: string };

function readFreshAvatarListCache() {
  if (!avatarListCache) {
    return null;
  }

  if (Date.now() - avatarListCache.cachedAt > avatarListCacheTtlMs) {
    avatarListCache = null;
    return null;
  }

  return avatarListCache.avatars;
}

function loadAvatarList() {
  const cachedAvatars = readFreshAvatarListCache();

  if (cachedAvatars) {
    return Promise.resolve(cachedAvatars);
  }

  const requestVersion = avatarListCacheVersion;

  avatarListRequest ??= listAvatars()
    .then(({ avatars }) => {
      if (requestVersion === avatarListCacheVersion) {
        avatarListCache = {
          avatars,
          cachedAt: Date.now(),
        };
      }

      return avatars;
    })
    .finally(() => {
      avatarListRequest = null;
    });

  return avatarListRequest;
}

export function invalidateAvatarListCache() {
  avatarListCacheVersion += 1;
  avatarListCache = null;
  avatarListRequest = null;
}

export function useAvatarList(): AvatarListState {
  const [state, setState] = useState<AvatarListState>(() => {
    const cachedAvatars = readFreshAvatarListCache();

    return cachedAvatars
      ? { status: "ready", avatars: cachedAvatars, error: null }
      : {
          status: "loading",
          avatars: [],
          error: null,
        };
  });

  useEffect(() => {
    let isMounted = true;

    loadAvatarList()
      .then((avatars) => {
        if (isMounted) {
          setState({ status: "ready", avatars, error: null });
        }
      })
      .catch((error) => {
        if (isMounted) {
          setState({
            status: "error",
            avatars: [],
            error: error instanceof Error ? error.message : "No pudimos cargar tus avatares.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}
