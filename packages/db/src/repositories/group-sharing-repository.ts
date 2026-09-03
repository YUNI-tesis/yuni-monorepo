import { Prisma, type PrismaClient } from "@prisma/client";
import {
  GroupSharingIneligibleError,
  GroupSharingPreparationBusyError,
  OwnershipError,
  SelfAccessGrantError,
  type CreateAccessGrantInput,
  type CreateShareLinkInput,
  type UpdateAccessGrantInput,
  type UpdateShareLinkInput,
} from "@yuni/domain";
import { enqueueGroupProviderSyncJob } from "./group-provider-sync-job";

type Db = PrismaClient | Prisma.TransactionClient;
const INLINE_GROUP_PROJECTION_STALE_AFTER_MS = 5 * 60_000;

export async function enqueueActiveGroupProviderSyncForAvatar(
  tx: Prisma.TransactionClient,
  input: { ownerId: string; avatarId: string; revision: string }
) {
  const activeMembership = await tx.avatarGroupMember.findFirst({
    where: {
      avatarAgentId: input.avatarId,
      avatarGroup: {
        is: {
          ownerId: input.ownerId,
          deletedAt: null,
          OR: [
            { shareLinks: { some: { isEnabled: true, deletedAt: null } } },
            { accessGrants: { some: { status: "active" } } },
          ],
        },
      },
    },
    select: { id: true },
  });
  if (!activeMembership) return false;
  const dedupeKey = `group-agent-sync:${input.avatarId}:content:${input.revision}`;
  await tx.avatarAgent.updateMany({
    where: { id: input.avatarId, ownerId: input.ownerId },
    data: {
      groupProviderSyncStatus: "syncing",
      groupProviderSyncError: null,
      groupProviderSyncRevision: dedupeKey,
    },
  });
  await enqueueGroupProviderSyncJob(tx, {
    ownerId: input.ownerId,
    avatarAgentId: input.avatarId,
    dedupeKey,
  });
  return true;
}

const groupMemberInclude = {
  members: {
    include: { avatarAgent: true },
    orderBy: { position: "asc" as const },
  },
} satisfies Prisma.AvatarGroupInclude;

export function createGroupSharingRepository(db: Db) {
  return {
    async createShareLink(ownerId: string, avatarGroupId: string, input: CreateShareLinkInput) {
      return withTransaction(db, async (tx) => {
        const group = await requireEligibleOwnedGroup(tx, ownerId, avatarGroupId);
        const activatesFirstChannel =
          input.isEnabled && (await hasNoActiveSharingChannels(tx, avatarGroupId));
        const link = await tx.groupShareLink.create({
          data: {
            avatarGroupId: group.id,
            ownerId,
            slug: input.slug,
            name: input.name,
            isEnabled: input.isEnabled,
            avatarGroupOwnerIdSnapshot: group.ownerId,
            avatarGroupNameSnapshot: group.name,
            groupMembershipVersion: group.membershipVersion,
            ...(input.limits ?? {}),
          },
        });
        if (link.isEnabled) {
          await enqueueGroupProviderPreparation(tx, group, { force: activatesFirstChannel });
        }
        return link;
      });
    },

    async listShareLinks(ownerId: string, avatarGroupId: string) {
      await requireOwnedGroup(db, ownerId, avatarGroupId);
      return db.groupShareLink.findMany({
        where: { ownerId, avatarGroupId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
    },

    async updateShareLink(
      ownerId: string,
      avatarGroupId: string,
      shareLinkId: string,
      input: UpdateShareLinkInput
    ) {
      return withTransaction(db, async (tx) => {
        const group = input.isEnabled
          ? await requireEligibleOwnedGroup(tx, ownerId, avatarGroupId)
          : await requireOwnedGroup(tx, ownerId, avatarGroupId);
        const current = await tx.groupShareLink.findFirst({
          where: { id: shareLinkId, ownerId, avatarGroupId, deletedAt: null },
        });
        if (!current) throw new OwnershipError();
        const activatesFirstChannel =
          input.isEnabled === true &&
          !current.isEnabled &&
          (await hasNoActiveSharingChannels(tx, avatarGroupId, { shareLinkId: current.id }));
        const updated = await tx.groupShareLink.update({
          where: { id: current.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
            ...(input.limits !== undefined
              ? {
                  maxSessionDurationSeconds: input.limits.maxSessionDurationSeconds,
                  maxSessionsPer24Hours: input.limits.maxSessionsPer24Hours,
                }
              : {}),
            ...updatedGroupSnapshot(group),
          },
        });
        if (updated.isEnabled) {
          await enqueueGroupProviderPreparation(tx, group, { force: activatesFirstChannel });
        }
        return updated;
      });
    },

    async deleteShareLink(ownerId: string, avatarGroupId: string, shareLinkId: string) {
      return withTransaction(db, async (tx) => {
        await requireOwnedGroup(tx, ownerId, avatarGroupId);
        const current = await tx.groupShareLink.findFirst({
          where: { id: shareLinkId, ownerId, avatarGroupId, deletedAt: null },
        });
        if (!current) throw new OwnershipError();
        return tx.groupShareLink.update({
          where: { id: current.id },
          data: { isEnabled: false, deletedAt: new Date() },
        });
      });
    },

    resolveEnabledShareLink(slug: string) {
      return db.groupShareLink.findFirst({
        where: {
          slug,
          isEnabled: true,
          deletedAt: null,
          avatarGroup: { is: { deletedAt: null } },
        },
        include: { avatarGroup: { include: groupMemberInclude } },
      });
    },

    async touchShareLink(shareLinkId: string) {
      await db.groupShareLink.updateMany({
        where: { id: shareLinkId, isEnabled: true, deletedAt: null },
        data: { lastUsedAt: new Date() },
      });
    },

    async createAccessGrant(ownerId: string, avatarGroupId: string, input: CreateAccessGrantInput) {
      return withTransaction(db, async (tx) => {
        const group = await requireEligibleOwnedGroup(tx, ownerId, avatarGroupId);
        const activatesFirstChannel = await hasNoActiveSharingChannels(tx, avatarGroupId);
        const participant = await tx.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (participant?.id === ownerId) throw new SelfAccessGrantError();
        const grant = await tx.groupAccessGrant.create({
          data: {
            avatarGroupId: group.id,
            ownerId,
            participantEmail: input.email,
            participantUserId: participant?.id ?? null,
            avatarGroupOwnerIdSnapshot: group.ownerId,
            avatarGroupNameSnapshot: group.name,
            groupMembershipVersion: group.membershipVersion,
            ...(input.limits ?? {}),
          },
        });
        await enqueueGroupProviderPreparation(tx, group, { force: activatesFirstChannel });
        return grant;
      });
    },

    async listAccessGrants(ownerId: string, avatarGroupId: string) {
      await requireOwnedGroup(db, ownerId, avatarGroupId);
      return db.groupAccessGrant.findMany({
        where: { ownerId, avatarGroupId },
        include: { avatarGroup: { select: { membershipVersion: true } } },
        orderBy: { createdAt: "desc" },
      });
    },

    async updateAccessGrant(
      ownerId: string,
      avatarGroupId: string,
      accessGrantId: string,
      input: UpdateAccessGrantInput
    ) {
      return withTransaction(db, async (tx) => {
        const group =
          input.status === "active"
            ? await requireEligibleOwnedGroup(tx, ownerId, avatarGroupId)
            : await requireOwnedGroup(tx, ownerId, avatarGroupId);
        const current = await tx.groupAccessGrant.findFirst({
          where: { id: accessGrantId, ownerId, avatarGroupId },
        });
        if (!current) throw new OwnershipError();
        const activatesFirstChannel =
          input.status === "active" &&
          current.status !== "active" &&
          (await hasNoActiveSharingChannels(tx, avatarGroupId, { accessGrantId: current.id }));
        const participant =
          input.status === "active" && current.participantUserId === null
            ? await tx.user.findUnique({
                where: { email: current.participantEmail },
                select: { id: true },
              })
            : null;
        const updated = await tx.groupAccessGrant.update({
          where: { id: current.id },
          data: {
            ...(input.status !== undefined
              ? { status: input.status, revokedAt: input.status === "revoked" ? new Date() : null }
              : {}),
            ...(input.limits !== undefined
              ? {
                  maxSessionDurationSeconds: input.limits.maxSessionDurationSeconds,
                  maxSessionsPer24Hours: input.limits.maxSessionsPer24Hours,
                }
              : {}),
            ...(participant ? { participantUserId: participant.id } : {}),
            ...updatedGroupSnapshot(group),
          },
        });
        if (updated.status === "active") {
          await enqueueGroupProviderPreparation(tx, group, { force: activatesFirstChannel });
        }
        return updated;
      });
    },

    async revokeAccessGrant(ownerId: string, avatarGroupId: string, accessGrantId: string) {
      return withTransaction(db, async (tx) => {
        await requireOwnedGroup(tx, ownerId, avatarGroupId);
        const current = await tx.groupAccessGrant.findFirst({
          where: { id: accessGrantId, ownerId, avatarGroupId },
        });
        if (!current) throw new OwnershipError();
        return tx.groupAccessGrant.update({
          where: { id: current.id },
          data: { status: "revoked", revokedAt: current.revokedAt ?? new Date() },
        });
      });
    },

    linkActiveForUser(userId: string, participantEmail: string) {
      return db.groupAccessGrant.updateMany({
        where: { participantEmail, participantUserId: null, status: "active" },
        data: { participantUserId: userId },
      });
    },
  };
}

function updatedGroupSnapshot(group: { ownerId: string; name: string; membershipVersion: number }) {
  return {
    avatarGroupOwnerIdSnapshot: group.ownerId,
    avatarGroupNameSnapshot: group.name,
    groupMembershipVersion: group.membershipVersion,
  };
}

async function requireOwnedGroup(db: Db, ownerId: string, avatarGroupId: string) {
  if (!("$transaction" in db)) {
    await db.$queryRaw(
      Prisma.sql`SELECT "id" FROM "AvatarGroup" WHERE "id" = ${avatarGroupId} AND "ownerId" = ${ownerId} AND "deletedAt" IS NULL FOR UPDATE`
    );
    await db.$queryRaw(
      Prisma.sql`SELECT "id" FROM "GroupShareLink" WHERE "avatarGroupId" = ${avatarGroupId} ORDER BY "id" FOR UPDATE`
    );
    await db.$queryRaw(
      Prisma.sql`SELECT "id" FROM "GroupAccessGrant" WHERE "avatarGroupId" = ${avatarGroupId} ORDER BY "id" FOR UPDATE`
    );
  }
  const group = await db.avatarGroup.findFirst({
    where: { id: avatarGroupId, ownerId, deletedAt: null },
    include: groupMemberInclude,
  });
  if (!group) throw new OwnershipError();
  return group;
}

async function requireEligibleOwnedGroup(db: Db, ownerId: string, avatarGroupId: string) {
  let group = await requireOwnedGroup(db, ownerId, avatarGroupId);
  if (!("$transaction" in db)) {
    const memberships = group.members
      .map((member) => ({ id: member.id, avatarAgentId: member.avatarAgentId }))
      .sort((left, right) => left.avatarAgentId.localeCompare(right.avatarAgentId));
    if (memberships.length > 0) {
      await db.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AvatarGroupMember" WHERE "id" IN (${Prisma.join(
          memberships.map((member) => member.id)
        )}) ORDER BY "id" FOR UPDATE`
      );
      await db.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AvatarAgent" WHERE "id" IN (${Prisma.join(
          memberships.map((member) => member.avatarAgentId).sort()
        )}) ORDER BY "id" FOR UPDATE`
      );
    }
    const locked = await db.avatarGroup.findFirst({
      where: { id: avatarGroupId, ownerId, deletedAt: null },
      include: groupMemberInclude,
    });
    if (!locked) throw new OwnershipError();
    group = locked;
  }
  if (
    group.members.length < 2 ||
    group.members.length > 3 ||
    group.members.some(
      (member) => member.accessGrantId !== null || member.avatarAgent.ownerId !== group.ownerId
    )
  ) {
    throw new GroupSharingIneligibleError();
  }
  return group;
}

async function enqueueGroupProviderPreparation(
  tx: Prisma.TransactionClient,
  group: Awaited<ReturnType<typeof requireOwnedGroup>>,
  options: { force: boolean }
) {
  for (const member of group.members) {
    const avatar = member.avatarAgent;
    if (avatar.groupProviderSyncStatus === "syncing") {
      const inlineProjectionIsFresh =
        avatar.groupProviderSyncRevision?.startsWith("inline:") &&
        Date.now() - avatar.updatedAt.getTime() < INLINE_GROUP_PROJECTION_STALE_AFTER_MS;
      if (options.force && inlineProjectionIsFresh) {
        throw new GroupSharingPreparationBusyError();
      }
      if (!options.force || !avatar.groupProviderSyncRevision?.startsWith("inline:")) continue;
    }
    if (
      avatar.status !== "active" ||
      (!options.force && avatar.groupProviderSyncStatus === "synced" && avatar.groupProviderAgentId)
    ) {
      continue;
    }
    const dedupeKey = `group-agent-sync:${avatar.id}:${avatar.updatedAt.getTime()}:${group.membershipVersion}`;
    await tx.avatarAgent.update({
      where: { id: avatar.id },
      data: {
        groupProviderSyncStatus: "syncing",
        groupProviderSyncError: null,
        groupProviderSyncRevision: dedupeKey,
      },
    });
    await enqueueGroupProviderSyncJob(tx, {
      ownerId: group.ownerId,
      avatarAgentId: avatar.id,
      dedupeKey,
    });
  }
}

async function hasNoActiveSharingChannels(
  tx: Prisma.TransactionClient,
  avatarGroupId: string,
  exclude: { shareLinkId?: string; accessGrantId?: string } = {}
) {
  const [links, grants] = await Promise.all([
    tx.groupShareLink.count({
      where: {
        avatarGroupId,
        isEnabled: true,
        deletedAt: null,
        ...(exclude.shareLinkId ? { id: { not: exclude.shareLinkId } } : {}),
      },
    }),
    tx.groupAccessGrant.count({
      where: {
        avatarGroupId,
        status: "active",
        ...(exclude.accessGrantId ? { id: { not: exclude.accessGrantId } } : {}),
      },
    }),
  ]);
  return links + grants === 0;
}

async function withTransaction<T>(
  db: Db,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if ("$transaction" in db) return db.$transaction(operation);
  return operation(db);
}
