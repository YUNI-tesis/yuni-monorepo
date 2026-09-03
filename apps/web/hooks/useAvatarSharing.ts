"use client";

import {
  createAccessGrant,
  createShareLink,
  deleteShareLink,
  listAccessGrants,
  listShareLinks,
  updateAccessGrant,
  updateShareLink,
} from "../lib/api/sharing-api";
import { useResourceSharing, type SharingApiAdapter } from "./useResourceSharing";

const avatarSharingAdapter: SharingApiAdapter = {
  listLinks: listShareLinks,
  createLink: createShareLink,
  updateLink: updateShareLink,
  removeLink: deleteShareLink,
  listGrants: listAccessGrants,
  createGrant: createAccessGrant,
  updateGrant: updateAccessGrant,
};

export function useAvatarSharing(avatarId: string) {
  return useResourceSharing(avatarId, avatarSharingAdapter);
}
