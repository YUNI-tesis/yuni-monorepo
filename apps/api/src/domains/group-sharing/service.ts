import {
  groupConsentScopeId,
  GroupSharingIneligibleError,
  GroupSharingPreparationBusyError,
  LiveAvatarConfigSchema,
  NotFoundError,
  OwnershipError,
  VoiceConfigSchema,
  type CreateAccessGrantInput,
  type CreateShareLinkInput,
  type UpdateAccessGrantInput,
  type UpdateShareLinkInput,
} from "@yuni/domain";
import type { createGroupSharingRepository } from "@yuni/db";
import { createLogger } from "@yuni/observability";
import { readSafeHttpUrl } from "../../utils/safe-url";
import { toInteractionLimits } from "../external-sessions/limits";
import { groupInteractionAvailability, groupSharingEligibility } from "./availability";

type Repository = ReturnType<typeof createGroupSharingRepository>;
const logger = createLogger("@yuni/api:group-sharing");

export type GroupSharingServiceDependencies = {
  repository: Repository;
  publicBaseUrl: string;
};

export class DuplicateGroupShareSlugError extends Error {}
export class DuplicateGroupAccessGrantError extends Error {}

export function createGroupSharingService(dependencies: GroupSharingServiceDependencies) {
  return {
    async createShareLink(ownerId: string, groupId: string, input: CreateShareLinkInput) {
      try {
        const record = await dependencies.repository.createShareLink(ownerId, groupId, input);
        logger.info("group sharing target created", {
          groupId,
          targetKind: "public_link",
          targetId: record.id,
        });
        return toShareLinkDto(record, dependencies.publicBaseUrl);
      } catch (error) {
        throw normalize(error, "link");
      }
    },

    async listShareLinks(ownerId: string, groupId: string) {
      try {
        return (await dependencies.repository.listShareLinks(ownerId, groupId)).map((record) =>
          toShareLinkDto(record, dependencies.publicBaseUrl)
        );
      } catch (error) {
        throw normalize(error, "link");
      }
    },

    async updateShareLink(
      ownerId: string,
      groupId: string,
      shareLinkId: string,
      input: UpdateShareLinkInput
    ) {
      try {
        const record = await dependencies.repository.updateShareLink(ownerId, groupId, shareLinkId, input);
        if (input.isEnabled === false) {
          logger.info("group sharing target disabled", {
            groupId,
            targetKind: "public_link",
            targetId: shareLinkId,
          });
        }
        return toShareLinkDto(record, dependencies.publicBaseUrl);
      } catch (error) {
        throw normalize(error, "link");
      }
    },

    async deleteShareLink(ownerId: string, groupId: string, shareLinkId: string) {
      try {
        await dependencies.repository.deleteShareLink(ownerId, groupId, shareLinkId);
        logger.info("group sharing target revoked", {
          groupId,
          targetKind: "public_link",
          targetId: shareLinkId,
        });
        return { ok: true as const };
      } catch (error) {
        throw normalize(error, "link");
      }
    },

    async createAccessGrant(ownerId: string, groupId: string, input: CreateAccessGrantInput) {
      try {
        const record = await dependencies.repository.createAccessGrant(ownerId, groupId, input);
        logger.info("group sharing target created", {
          groupId,
          targetKind: "account_grant",
          targetId: record.id,
        });
        return toAccessGrantDto(record);
      } catch (error) {
        throw normalize(error, "grant");
      }
    },

    async listAccessGrants(ownerId: string, groupId: string) {
      try {
        return (await dependencies.repository.listAccessGrants(ownerId, groupId)).map(toAccessGrantDto);
      } catch (error) {
        throw normalize(error, "grant");
      }
    },

    async updateAccessGrant(
      ownerId: string,
      groupId: string,
      accessGrantId: string,
      input: UpdateAccessGrantInput
    ) {
      try {
        const record = await dependencies.repository.updateAccessGrant(
          ownerId,
          groupId,
          accessGrantId,
          input
        );
        if (input.status === "revoked") {
          logger.info("group sharing target revoked", {
            groupId,
            targetKind: "account_grant",
            targetId: accessGrantId,
          });
        }
        return toAccessGrantDto(record);
      } catch (error) {
        throw normalize(error, "grant");
      }
    },

    async revokeAccessGrant(ownerId: string, groupId: string, accessGrantId: string) {
      try {
        await dependencies.repository.revokeAccessGrant(ownerId, groupId, accessGrantId);
        logger.info("group sharing target revoked", {
          groupId,
          targetKind: "account_grant",
          targetId: accessGrantId,
        });
        return { ok: true as const, outcome: "revoked" as const };
      } catch (error) {
        throw normalize(error, "grant");
      }
    },

    async resolvePublicGroup(slug: string) {
      const link = await dependencies.repository.resolveEnabledShareLink(slug);
      const group = link?.avatarGroup;
      if (!link || !group) throw new NotFoundError("Public group not found");
      const eligibility = groupSharingEligibility(group);
      if (eligibility.status !== "eligible") throw new NotFoundError("Public group not found");
      const availability = groupInteractionAvailability(group);
      return {
        shareLink: { name: link.name, slug: link.slug, limits: toInteractionLimits(link) },
        group: {
          id: group.id,
          name: group.name,
          membershipVersion: group.membershipVersion,
          members: group.members.map((member) => {
            const live = LiveAvatarConfigSchema.safeParse(member.avatarAgent.liveAvatarConfig);
            return {
              id: member.avatarAgent.id,
              position: member.position,
              name: member.avatarAgent.name,
              description: member.avatarAgent.description,
              thumbnailUrl: live.success ? readSafeHttpUrl(live.data.thumbnailUrl) : null,
              available:
                member.avatarAgent.status === "active" &&
                member.avatarAgent.groupProviderSyncStatus === "synced" &&
                Boolean(member.avatarAgent.groupProviderAgentId) &&
                live.success &&
                VoiceConfigSchema.safeParse(member.avatarAgent.voiceConfig).success,
            };
          }),
        },
        interactionAvailability: availability,
        sharingEligibility: eligibility,
        consent: {
          scopeId: groupConsentScopeId("share-link", link.id),
          version: String(group.membershipVersion),
        },
      };
    },
  };
}

function toShareLinkDto(
  record: {
    id: string;
    avatarGroupId: string | null;
    slug: string;
    name: string;
    isEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt: Date | null;
    maxSessionDurationSeconds: number | null;
    maxSessionsPer24Hours: number | null;
  },
  publicBaseUrl: string
) {
  return {
    id: record.id,
    avatarGroupId: record.avatarGroupId,
    slug: record.slug,
    name: record.name,
    isEnabled: record.isEnabled,
    publicUrl: `${publicBaseUrl.replace(/\/$/, "")}/g/${record.slug}`,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    limits: toInteractionLimits(record),
  };
}

function toAccessGrantDto(record: {
  id: string;
  avatarGroupId: string | null;
  participantEmail: string;
  participantUserId: string | null;
  status: "active" | "revoked";
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  maxSessionDurationSeconds: number | null;
  maxSessionsPer24Hours: number | null;
  groupMembershipVersion: number;
  avatarGroup?: { membershipVersion: number } | null;
}) {
  return {
    id: record.id,
    avatarGroupId: record.avatarGroupId,
    participantEmail: record.participantEmail,
    participantUserId: record.participantUserId,
    state: record.status === "revoked" ? "revoked" : record.participantUserId ? "linked" : "pending",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    limits: toInteractionLimits(record),
    consent: {
      scopeId: groupConsentScopeId("access-grant", record.id),
      version: String(record.avatarGroup?.membershipVersion ?? record.groupMembershipVersion),
    },
  };
}

function normalize(error: unknown, target: "link" | "grant") {
  if (error instanceof GroupSharingIneligibleError || error instanceof GroupSharingPreparationBusyError) {
    return error;
  }
  if (error instanceof OwnershipError) return new NotFoundError("Group sharing resource not found");
  if (isUniqueConstraintError(error)) {
    return target === "link" ? new DuplicateGroupShareSlugError() : new DuplicateGroupAccessGrantError();
  }
  return error instanceof Error ? error : new Error("Unknown group sharing error");
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export type GroupShareLinkDto = ReturnType<typeof toShareLinkDto>;
export type GroupAccessGrantDto = ReturnType<typeof toAccessGrantDto>;
export type PublicGroupShareDto = Awaited<
  ReturnType<ReturnType<typeof createGroupSharingService>["resolvePublicGroup"]>
>;
