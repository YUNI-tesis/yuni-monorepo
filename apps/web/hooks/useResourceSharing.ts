"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  ApiAccessGrantBase,
  ApiInteractionLimits,
  ApiShareLinkBase,
  CreateShareLinkRequest,
} from "../lib/api/sharing-api";
import { toUserFacingApiError } from "../lib/api/http-client";

export type SharingResourceState<T> =
  | { status: "loading"; data: T; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: T; error: string };

export type SharingController = {
  links: SharingResourceState<ApiShareLinkBase[]>;
  grants: SharingResourceState<ApiAccessGrantBase[]>;
  retryLinks: () => void;
  retryGrants: () => void;
  isMutating: (key: string) => boolean;
  createLink: (input: CreateShareLinkRequest) => Promise<ApiShareLinkBase>;
  setLinkEnabled: (link: ApiShareLinkBase, isEnabled: boolean) => Promise<ApiShareLinkBase>;
  updateLinkLimits: (linkId: string, limits: ApiInteractionLimits) => Promise<ApiShareLinkBase>;
  removeLink: (linkId: string) => Promise<void>;
  createGrant: (email: string, limits?: ApiInteractionLimits) => Promise<ApiAccessGrantBase>;
  setGrantStatus: (grantId: string, status: "active" | "revoked") => Promise<ApiAccessGrantBase>;
  updateGrantLimits: (grantId: string, limits: ApiInteractionLimits) => Promise<ApiAccessGrantBase>;
};

export type SharingApiAdapter = {
  listLinks: (resourceId: string) => Promise<{ shareLinks: ApiShareLinkBase[] }>;
  createLink: (resourceId: string, input: CreateShareLinkRequest) => Promise<{ shareLink: ApiShareLinkBase }>;
  updateLink: (
    resourceId: string,
    linkId: string,
    input: { isEnabled?: boolean; limits?: ApiInteractionLimits }
  ) => Promise<{ shareLink: ApiShareLinkBase }>;
  removeLink: (resourceId: string, linkId: string) => Promise<unknown>;
  listGrants: (resourceId: string) => Promise<{ accessGrants: ApiAccessGrantBase[] }>;
  createGrant: (
    resourceId: string,
    email: string,
    limits?: ApiInteractionLimits
  ) => Promise<{ accessGrant: ApiAccessGrantBase }>;
  updateGrant: (
    resourceId: string,
    grantId: string,
    input: { status?: "active" | "revoked"; limits?: ApiInteractionLimits }
  ) => Promise<{ accessGrant: ApiAccessGrantBase }>;
};

type SharingChannels = { links: boolean; grants: boolean };

const allChannels: SharingChannels = { links: true, grants: true };

export function useResourceSharing(
  resourceId: string,
  adapter: SharingApiAdapter,
  channels: SharingChannels = allChannels
): SharingController {
  const [links, setLinks] = useState<SharingResourceState<ApiShareLinkBase[]>>({
    status: "loading",
    data: [],
    error: null,
  });
  const [grants, setGrants] = useState<SharingResourceState<ApiAccessGrantBase[]>>({
    status: "loading",
    data: [],
    error: null,
  });
  const [mutations, setMutations] = useState<Set<string>>(() => new Set());
  const linksRequestRef = useRef(0);
  const grantsRequestRef = useRef(0);
  const activeResourceIdRef = useRef(resourceId);
  activeResourceIdRef.current = resourceId;

  const loadLinks = useCallback(
    async (clearCurrent = false) => {
      const requestId = ++linksRequestRef.current;
      if (!channels.links) {
        setLinks({ status: "ready", data: [], error: null });
        return;
      }
      setLinks((current) => ({
        status: "loading",
        data: clearCurrent ? [] : current.data,
        error: null,
      }));
      try {
        const response = await adapter.listLinks(resourceId);
        if (linksRequestRef.current !== requestId) return;
        setLinks({ status: "ready", data: response.shareLinks, error: null });
      } catch (error) {
        if (linksRequestRef.current !== requestId) return;
        setLinks((current) => ({
          status: "error",
          data: current.data,
          error: sharingErrorMessage(error),
        }));
      }
    },
    [adapter, channels.links, resourceId]
  );

  const loadGrants = useCallback(
    async (clearCurrent = false) => {
      const requestId = ++grantsRequestRef.current;
      if (!channels.grants) {
        setGrants({ status: "ready", data: [], error: null });
        return;
      }
      setGrants((current) => ({
        status: "loading",
        data: clearCurrent ? [] : current.data,
        error: null,
      }));
      try {
        const response = await adapter.listGrants(resourceId);
        if (grantsRequestRef.current !== requestId) return;
        setGrants({ status: "ready", data: response.accessGrants, error: null });
      } catch (error) {
        if (grantsRequestRef.current !== requestId) return;
        setGrants((current) => ({
          status: "error",
          data: current.data,
          error: sharingErrorMessage(error),
        }));
      }
    },
    [adapter, channels.grants, resourceId]
  );

  useEffect(() => {
    setMutations(new Set());
    void Promise.all([loadLinks(true), loadGrants(true)]);
    return () => {
      linksRequestRef.current += 1;
      grantsRequestRef.current += 1;
    };
  }, [loadGrants, loadLinks]);

  async function mutate<T>(key: string, action: () => Promise<T>) {
    const scopedKey = `${resourceId}:${key}`;
    setMutations((current) => new Set(current).add(scopedKey));
    try {
      return await action();
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
    retryLinks: () => void loadLinks(),
    retryGrants: () => void loadGrants(),
    isMutating: (key) => mutations.has(`${resourceId}:${key}`),
    async createLink(input) {
      const { shareLink } = await mutate("link:create", () => adapter.createLink(resourceId, input));
      if (activeResourceIdRef.current === resourceId) {
        setLinks((current) => ({
          status: "ready",
          data: [shareLink, ...current.data],
          error: null,
        }));
      }
      return shareLink;
    },
    async setLinkEnabled(link, isEnabled) {
      const { shareLink } = await mutate(`link:${link.id}`, () =>
        adapter.updateLink(resourceId, link.id, { isEnabled })
      );
      replaceLinkIfCurrent(resourceId, activeResourceIdRef, setLinks, shareLink);
      return shareLink;
    },
    async updateLinkLimits(linkId, limits) {
      const { shareLink } = await mutate(`link:${linkId}`, () =>
        adapter.updateLink(resourceId, linkId, { limits })
      );
      replaceLinkIfCurrent(resourceId, activeResourceIdRef, setLinks, shareLink);
      return shareLink;
    },
    async removeLink(linkId) {
      await mutate(`link:${linkId}`, () => adapter.removeLink(resourceId, linkId));
      if (activeResourceIdRef.current !== resourceId) return;
      setLinks((current) => ({
        status: "ready",
        data: current.data.filter((link) => link.id !== linkId),
        error: null,
      }));
    },
    async createGrant(email, limits) {
      const { accessGrant } = await mutate("grant:create", () =>
        adapter.createGrant(resourceId, email, limits)
      );
      if (activeResourceIdRef.current === resourceId) {
        setGrants((current) => ({
          status: "ready",
          data: [accessGrant, ...current.data],
          error: null,
        }));
      }
      return accessGrant;
    },
    async setGrantStatus(grantId, status) {
      const { accessGrant } = await mutate(`grant:${grantId}`, () =>
        adapter.updateGrant(resourceId, grantId, { status })
      );
      replaceGrantIfCurrent(resourceId, activeResourceIdRef, setGrants, accessGrant);
      return accessGrant;
    },
    async updateGrantLimits(grantId, limits) {
      const { accessGrant } = await mutate(`grant:${grantId}`, () =>
        adapter.updateGrant(resourceId, grantId, { limits })
      );
      replaceGrantIfCurrent(resourceId, activeResourceIdRef, setGrants, accessGrant);
      return accessGrant;
    },
  };
}

function replaceLinkIfCurrent(
  resourceId: string,
  activeResourceIdRef: { current: string },
  setLinks: Dispatch<SetStateAction<SharingResourceState<ApiShareLinkBase[]>>>,
  shareLink: ApiShareLinkBase
) {
  if (activeResourceIdRef.current !== resourceId) return;
  setLinks((current) => ({
    status: "ready",
    data: current.data.map((candidate) => (candidate.id === shareLink.id ? shareLink : candidate)),
    error: null,
  }));
}

function replaceGrantIfCurrent(
  resourceId: string,
  activeResourceIdRef: { current: string },
  setGrants: Dispatch<SetStateAction<SharingResourceState<ApiAccessGrantBase[]>>>,
  accessGrant: ApiAccessGrantBase
) {
  if (activeResourceIdRef.current !== resourceId) return;
  setGrants((current) => ({
    status: "ready",
    data: current.data.map((candidate) => (candidate.id === accessGrant.id ? accessGrant : candidate)),
    error: null,
  }));
}

function sharingErrorMessage(error: unknown) {
  return toUserFacingApiError(error, "No pudimos completar la acción.");
}
