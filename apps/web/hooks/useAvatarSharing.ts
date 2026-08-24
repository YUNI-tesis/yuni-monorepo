"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type ApiInteractionLimits,
} from "../lib/api/sharing-api";
import { ApiClientError, toUserFacingApiError } from "../lib/api/http-client";

type ResourceState<T> =
  | { status: "loading"; data: T; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: T; error: string };

function errorMessage(error: unknown) {
  return toUserFacingApiError(error, "No pudimos completar la acción.");
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
  const linksRequestRef = useRef(0);
  const grantsRequestRef = useRef(0);
  const activeAvatarIdRef = useRef(avatarId);
  activeAvatarIdRef.current = avatarId;

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

  const loadLinks = useCallback(
    async (clearCurrent = false) => {
      const requestId = linksRequestRef.current + 1;
      linksRequestRef.current = requestId;
      setLinks((current) => ({
        status: "loading",
        data: clearCurrent ? [] : current.data,
        error: null,
      }));

      try {
        const response = await listShareLinks(avatarId);
        if (linksRequestRef.current !== requestId) return;
        setLinks({ status: "ready", data: response.shareLinks, error: null });
      } catch (error) {
        if (linksRequestRef.current !== requestId) return;
        handleUnauthorized(error);
        setLinks((current) => ({
          status: "error",
          data: current.data,
          error: errorMessage(error),
        }));
      }
    },
    [avatarId, handleUnauthorized]
  );

  const loadGrants = useCallback(
    async (clearCurrent = false) => {
      const requestId = grantsRequestRef.current + 1;
      grantsRequestRef.current = requestId;
      setGrants((current) => ({
        status: "loading",
        data: clearCurrent ? [] : current.data,
        error: null,
      }));

      try {
        const response = await listAccessGrants(avatarId);
        if (grantsRequestRef.current !== requestId) return;
        setGrants({ status: "ready", data: response.accessGrants, error: null });
      } catch (error) {
        if (grantsRequestRef.current !== requestId) return;
        handleUnauthorized(error);
        setGrants((current) => ({
          status: "error",
          data: current.data,
          error: errorMessage(error),
        }));
      }
    },
    [avatarId, handleUnauthorized]
  );

  useEffect(() => {
    setMutations(new Set());
    void Promise.all([loadLinks(true), loadGrants(true)]);
  }, [loadGrants, loadLinks]);

  async function mutate<T>(key: string, action: () => Promise<T>) {
    const scopedKey = `${avatarId}:${key}`;
    setMutations((current) => new Set(current).add(scopedKey));

    try {
      return await action();
    } catch (error) {
      handleUnauthorized(error);
      throw error;
    } finally {
      setMutations((current) => {
        const next = new Set(current);
        next.delete(scopedKey);
        return next;
      });
    }
  }

  return {
    links,
    grants,
    retryLinks: () => loadLinks(),
    retryGrants: () => loadGrants(),
    isMutating(key: string) {
      return mutations.has(`${avatarId}:${key}`);
    },
    async createLink(input: CreateShareLinkRequest) {
      const { shareLink } = await mutate("link:create", () => createShareLink(avatarId, input));
      if (activeAvatarIdRef.current !== avatarId) return shareLink;
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
      if (activeAvatarIdRef.current !== avatarId) return shareLink;
      setLinks((current) => ({
        status: "ready",
        data: current.data.map((candidate) => (candidate.id === shareLink.id ? shareLink : candidate)),
        error: null,
      }));
      return shareLink;
    },
    async updateLinkLimits(linkId: string, limits: ApiInteractionLimits) {
      const { shareLink } = await mutate(`link:${linkId}`, () =>
        updateShareLink(avatarId, linkId, { limits })
      );
      if (activeAvatarIdRef.current !== avatarId) return shareLink;
      setLinks((current) => ({
        status: "ready",
        data: current.data.map((candidate) => (candidate.id === shareLink.id ? shareLink : candidate)),
        error: null,
      }));
      return shareLink;
    },
    async removeLink(linkId: string) {
      await mutate(`link:${linkId}`, () => deleteShareLink(avatarId, linkId));
      if (activeAvatarIdRef.current !== avatarId) return;
      setLinks((current) => ({
        status: "ready",
        data: current.data.filter((link) => link.id !== linkId),
        error: null,
      }));
    },
    async createGrant(email: string, limits?: ApiInteractionLimits) {
      const { accessGrant } = await mutate("grant:create", () => createAccessGrant(avatarId, email, limits));
      if (activeAvatarIdRef.current !== avatarId) return accessGrant;
      setGrants((current) => ({
        status: "ready",
        data: [accessGrant, ...current.data],
        error: null,
      }));
      return accessGrant;
    },
    async setGrantStatus(grantId: string, status: "active" | "revoked") {
      const { accessGrant } = await mutate(`grant:${grantId}`, () =>
        updateAccessGrant(avatarId, grantId, { status })
      );
      if (activeAvatarIdRef.current !== avatarId) return accessGrant;
      setGrants((current) => ({
        status: "ready",
        data: current.data.map((candidate) => (candidate.id === accessGrant.id ? accessGrant : candidate)),
        error: null,
      }));
      return accessGrant;
    },
    async updateGrantLimits(grantId: string, limits: ApiInteractionLimits) {
      const { accessGrant } = await mutate(`grant:${grantId}`, () =>
        updateAccessGrant(avatarId, grantId, { limits })
      );
      if (activeAvatarIdRef.current !== avatarId) return accessGrant;
      setGrants((current) => ({
        status: "ready",
        data: current.data.map((candidate) => (candidate.id === accessGrant.id ? accessGrant : candidate)),
        error: null,
      }));
      return accessGrant;
    },
    async removeGrant(grantId: string) {
      const result = await mutate(`grant:${grantId}`, () => deleteAccessGrant(avatarId, grantId));
      if (activeAvatarIdRef.current !== avatarId) return result.outcome;

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
