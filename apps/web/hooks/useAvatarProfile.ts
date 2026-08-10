"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAvatar, type ApiAvatar } from "../lib/api/avatar-api";
import { ApiClientError } from "../lib/api/http-client";

export type AvatarProfileState =
  | {
      status: "loading";
      avatar: null;
      error: null;
    }
  | {
      status: "ready";
      avatar: ApiAvatar;
      error: null;
    }
  | {
      status: "not-found" | "error";
      avatar: null;
      error: string;
    };

export type AvatarProfileResult = AvatarProfileState & { reload: () => void };

export function useAvatarProfile(avatarId: string): AvatarProfileResult {
  const router = useRouter();
  const [state, setState] = useState<AvatarProfileState>({
    status: "loading",
    avatar: null,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    setState({ status: "loading", avatar: null, error: null });

    getAvatar(avatarId)
      .then(({ avatar }) => {
        if (isMounted) {
          setState({ status: "ready", avatar, error: null });
        }
      })
      .catch((caughtError) => {
        if (caughtError instanceof ApiClientError && caughtError.status === 401) {
          router.push("/auth/login");
          return;
        }

        if (!isMounted) {
          return;
        }

        if (caughtError instanceof ApiClientError && caughtError.status === 404) {
          setState({
            status: "not-found",
            avatar: null,
            error: "No encontramos este avatar.",
          });
          return;
        }

        setState({
          status: "error",
          avatar: null,
          error: caughtError instanceof Error ? caughtError.message : "No pudimos cargar el perfil.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [avatarId, reloadKey, router]);

  return {
    ...state,
    reload: () => setReloadKey((current) => current + 1),
  };
}
