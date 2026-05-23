"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiClientError, getAvatar, type ApiAvatar } from "../lib/api-client";

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

export function useAvatarProfile(avatarId: string): AvatarProfileState {
  const router = useRouter();
  const [state, setState] = useState<AvatarProfileState>({
    status: "loading",
    avatar: null,
    error: null,
  });

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
  }, [avatarId, router]);

  return state;
}
