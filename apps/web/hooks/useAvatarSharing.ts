"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAccessGrant,
  createShareLink,
  deleteAccessGrant,
  deleteShareLink,
  listAccessGrants,
  listShareLinks,
  updateAccessGrant,
  updateShareLink,
  type ApiAccessGrant,
  type ApiShareLink,
  type CreateShareLinkRequest,
} from "../lib/api/sharing-api";
import { ApiClientError } from "../lib/api/http-client";

type ResourceState<T> =
  | { status: "loading"; data: T; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: T; error: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos completar la acción.";
}

export function useAvatarSharing(avatarId: string) {
  const router = useRouter();
  const [links, setLinks] = useState<ResourceState<ApiShareLink[]>>({
    status: "loading",
    data: [],
    error: null,
  });
  const [grants, setGrants] = useState<ResourceState<ApiAccessGrant[]>>({
    status: "loading",
    data: [],
    error: null,
  });
  const [mutations, setMutations] = useState<Set<string>>(() => new Set());

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

  const loadLinks = useCallback(async () => {
    setLinks((current) => ({ status: "loading", data: current.data, error: null }));

    try {
      const response = await listShareLinks(avatarId);
      setLinks({ status: "ready", data: response.shareLinks, error: null });
    } catch (error) {
      handleUnauthorized(error);
      setLinks((current) => ({
        status: "error",
        data: current.data,
        error: errorMessage(error),
      }));
    }
  }, [avatarId, handleUnauthorized]);

  const loadGrants = useCallback(async () => {
    setGrants((current) => ({ status: "loading", data: current.data, error: null }));

    try {
      const response = await listAccessGrants(avatarId);
      setGrants({ status: "ready", data: response.accessGrants, error: null });
    } catch (error) {
      handleUnauthorized(error);
      setGrants((current) => ({
        status: "error",
        data: current.data,
        error: errorMessage(error),
      }));
    }
  }, [avatarId, handleUnauthorized]);

  useEffect(() => {
    void Promise.all([loadLinks(), loadGrants()]);
  }, [loadGrants, loadLinks]);

  async function mutate<T>(key: string, action: () => Promise<T>) {
    setMutations((current) => new Set(current).add(key));

    try {
      return await action();
    } catch (error) {
      handleUnauthorized(error);
      throw error;
    } finally {
      setMutations((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  return {
    links,
    grants,
    retryLinks: loadLinks,
    retryGrants: loadGrants,
    isMutating(key: string) {
      return mutations.has(key);
    },
    async createLink(input: CreateShareLinkRequest) {
      const { shareLink } = await mutate("link:create", () => createShareLink(avatarId, input));
      setLinks((current) => ({
        status: "ready",
        data: [shareLink, ...current.data],
        error: null,
      }));
      return shareLink;
    },
    async setLinkEnabled(link: ApiShareLink, isEnabled: boolean) {
      const { shareLink } = await mutate(`link:${link.id}`, () =>
        updateShareLink(avatarId, link.id, { isEnabled })
      );
      setLinks((current) => ({
        status: "ready",
        data: current.data.map((candidate) => (candidate.id === shareLink.id ? shareLink : candidate)),
        error: null,
      }));
      return shareLink;
    },
    async removeLink(linkId: string) {
      await mutate(`link:${linkId}`, () => deleteShareLink(avatarId, linkId));
      setLinks((current) => ({
        status: "ready",
        data: current.data.filter((link) => link.id !== linkId),
        error: null,
      }));
    },
    async createGrant(email: string) {
      const { accessGrant } = await mutate("grant:create", () => createAccessGrant(avatarId, email));
      setGrants((current) => ({
        status: "ready",
        data: [accessGrant, ...current.data],
        error: null,
      }));
      return accessGrant;
    },
    async setGrantStatus(grantId: string, status: "active" | "revoked") {
      const { accessGrant } = await mutate(`grant:${grantId}`, () =>
        updateAccessGrant(avatarId, grantId, status)
      );
      setGrants((current) => ({
        status: "ready",
        data: current.data.map((candidate) => (candidate.id === accessGrant.id ? accessGrant : candidate)),
        error: null,
      }));
      return accessGrant;
    },
    async removeGrant(grantId: string) {
      const result = await mutate(`grant:${grantId}`, () => deleteAccessGrant(avatarId, grantId));

      if (result.outcome === "deleted") {
        setGrants((current) => ({
          status: "ready",
          data: current.data.filter((grant) => grant.id !== grantId),
          error: null,
        }));
      } else {
        await loadGrants();
      }

      return result.outcome;
    },
  };
}
