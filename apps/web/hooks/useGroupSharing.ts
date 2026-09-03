"use client";

import {
  createGroupAccessGrant,
  createGroupShareLink,
  deleteGroupShareLink,
  listGroupAccessGrants,
  listGroupShareLinks,
  updateGroupAccessGrant,
  updateGroupShareLink,
} from "../lib/api/group-sharing-api";
import { useResourceSharing, type SharingApiAdapter } from "./useResourceSharing";

const groupSharingAdapter: SharingApiAdapter = {
  listLinks: listGroupShareLinks,
  createLink: createGroupShareLink,
  updateLink: updateGroupShareLink,
  removeLink: deleteGroupShareLink,
  listGrants: listGroupAccessGrants,
  createGrant: createGroupAccessGrant,
  updateGrant: updateGroupAccessGrant,
};

export function useGroupSharing(
  groupId: string,
  channels: { account: boolean; public: boolean } = { account: true, public: true }
) {
  return useResourceSharing(groupId, groupSharingAdapter, {
    links: channels.public,
    grants: channels.account,
  });
}
