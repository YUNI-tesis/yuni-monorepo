import { Prisma, type PrismaClient } from "@prisma/client";
import {
  GroupSharingIneligibleError,
  groupConsentScopeId,
  LiveAvatarConfigSchema,
  NotFoundError,
  VoiceConfigSchema,
} from "@yuni/domain";
import { enqueueGroupProviderSyncJob } from "./group-provider-sync-job";
import {
  countActiveExternalSessionsForAvatar,
  countActiveExternalSessionsForParticipant,
  lockExternalParticipant,
  normalizeExternalParticipantEmail,
} from "./external-session-capacity";

type Db = PrismaClient;

class ConditionalFloorClaimError extends Error {}
class ConditionalParticipantClaimError extends Error {}

const SESSION_CLEANUP_MAX_ATTEMPTS = 12;

function sessionCleanupDedupeKey(realtimeSessionId: string) {
  return `liveavatar-session-cleanup:${realtimeSessionId}`;
}

export async function enqueueSessionCleanup(
  tx: Prisma.TransactionClient,
  input: {
    realtimeSessionId: string;
    providerSessionTokenCiphertext: string | null;
    ownerId?: string | null | undefined;
    avatarAgentId?: string | null | undefined;
  }
) {
  if (!input.providerSessionTokenCiphertext) return null;
  return tx.job.upsert({
    where: { dedupeKey: sessionCleanupDedupeKey(input.realtimeSessionId) },
    create: {
      type: "session_cleanup",
      dedupeKey: sessionCleanupDedupeKey(input.realtimeSessionId),
      maxAttempts: SESSION_CLEANUP_MAX_ATTEMPTS,
      ownerId: input.ownerId ?? null,
      avatarAgentId: input.avatarAgentId ?? null,
      payload: {
        version: 1,
        provider: "liveavatar",
        realtimeSessionId: input.realtimeSessionId,
        providerSessionTokenCiphertext: input.providerSessionTokenCiphertext,
      },
    },
    update: {},
  });
}

async function lockAvatarAgents(tx: Prisma.TransactionClient, avatarIds: string[]) {
  const ids = [...new Set(avatarIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "AvatarAgent" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
  );
}

async function lockAvatarGroups(tx: Prisma.TransactionClient, groupIds: string[]) {
  const ids = [...new Set(groupIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "AvatarGroup" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
  );
}

function sameOrderedIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

async function lockAccessGrants(tx: Prisma.TransactionClient, accessGrantIds: string[]) {
  const ids = [...new Set(accessGrantIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "AccessGrant" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
  );
}

async function findMemberGrantIds(tx: Prisma.TransactionClient, userId: string, avatarIds: string[]) {
  if (avatarIds.length === 0) return [];
  const grants = await tx.accessGrant.findMany({
    where: {
      avatarAgentId: { in: avatarIds },
      participantUserId: userId,
      status: "active",
    },
    select: { id: true },
  });
  return grants.map((grant) => grant.id);
}

async function lockGroupVoiceSessions(tx: Prisma.TransactionClient, sessionIds: string[]) {
  const ids = [...new Set(sessionIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "GroupVoiceSession" WHERE "id" IN (${Prisma.join(
      ids
    )}) ORDER BY "id" FOR UPDATE`
  );
}

const avatarWithKnowledgeInclude = {
  documents: {
    where: { deletedAt: null, status: "ready" as const },
    include: { providerSync: true },
  },
  avatarGroupMembers: {
    where: {
      avatarGroup: {
        is: {
          deletedAt: null,
          OR: [
            { shareLinks: { some: { isEnabled: true, deletedAt: null } } },
            { accessGrants: { some: { status: "active" as const } } },
          ],
        },
      },
    },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.AvatarAgentInclude;

const memberInclude = {
  avatarAgent: { include: avatarWithKnowledgeInclude },
  accessGrant: true,
} satisfies Prisma.AvatarGroupMemberInclude;

const groupInclude = {
  members: {
    include: memberInclude,
    orderBy: { position: "asc" as const },
  },
} satisfies Prisma.AvatarGroupInclude;

const accessibleGroupInclude = {
  ...groupInclude,
  owner: { select: { name: true } },
  _count: {
    select: {
      accessGrants: { where: { status: "active" as const } },
      shareLinks: { where: { isEnabled: true, deletedAt: null } },
    },
  },
} satisfies Prisma.AvatarGroupInclude;

const publicSessionPrincipalPrefix = "group-public:";

function sessionPrincipalWhere(principalId: string) {
  return principalId.startsWith(publicSessionPrincipalPrefix)
    ? { groupPublicSessionId: principalId.slice(publicSessionPrincipalPrefix.length) }
    : { initiatorUserId: principalId };
}

function sessionPrincipalId(session: {
  initiatorUserId: string | null;
  groupPublicSessionId: string | null;
}) {
  if (session.groupPublicSessionId) return groupPublicSessionPrincipal(session.groupPublicSessionId);
  if (session.initiatorUserId) return session.initiatorUserId;
  throw new Error("Group voice session has no authorization principal");
}

export function groupPublicSessionPrincipal(groupPublicSessionId: string) {
  return `${publicSessionPrincipalPrefix}${groupPublicSessionId}`;
}

export class GroupVoiceUsageLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Group share session count limit reached");
  }
}

export class GroupVoiceActiveSessionError extends Error {
  constructor() {
    super("An active group share session already exists");
  }
}

export class GroupVoiceCapacityError extends Error {
  constructor(readonly retryAfterSeconds = 60) {
    super("External group session capacity reached");
  }
}

export class GroupVoiceRosterUnavailableError extends Error {
  constructor() {
    super("The complete group roster is not ready");
    this.name = "GroupVoiceRosterUnavailableError";
  }
}

export class GroupConsentVersionStaleError extends Error {
  constructor() {
    super("Group consent version is stale");
  }
}

export function createAvatarGroupRepository(db: Db) {
  async function resolveMembers(tx: Prisma.TransactionClient, userId: string, avatarIds: string[]) {
    const avatars = await tx.avatarAgent.findMany({
      where: {
        id: { in: avatarIds },
        status: "active",
        OR: [
          { ownerId: userId },
          {
            accessGrants: {
              some: { participantUserId: userId, status: "active" },
            },
          },
        ],
      },
      include: {
        accessGrants: {
          where: { participantUserId: userId, status: "active" },
          take: 1,
        },
      },
    });

    const byId = new Map(avatars.map((avatar) => [avatar.id, avatar]));
    if (byId.size !== avatarIds.length) {
      throw new NotFoundError("Uno o más avatares no están disponibles");
    }

    return avatarIds.map((avatarAgentId, position) => {
      const avatar = byId.get(avatarAgentId)!;
      return {
        avatarAgentId,
        position,
        accessGrantId: avatar.ownerId === userId ? null : (avatar.accessGrants[0]?.id ?? null),
      };
    });
  }

  return {
    listOwned(ownerId: string) {
      return db.avatarGroup.findMany({
        where: { ownerId, deletedAt: null },
        include: accessibleGroupInclude,
        orderBy: { updatedAt: "desc" },
      });
    },

    findOwned(ownerId: string, groupId: string) {
      return db.avatarGroup.findFirst({
        where: { id: groupId, ownerId, deletedAt: null },
        include: accessibleGroupInclude,
      });
    },

    listAccessible(userId: string) {
      return db.avatarGroup.findMany({
        where: {
          deletedAt: null,
          OR: [
            { ownerId: userId },
            { accessGrants: { some: { participantUserId: userId, status: "active" } } },
          ],
        },
        include: {
          ...accessibleGroupInclude,
          accessGrants: {
            where: { participantUserId: userId, status: "active" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    },

    findAccessible(userId: string, groupId: string) {
      return db.avatarGroup.findFirst({
        where: {
          id: groupId,
          deletedAt: null,
          OR: [
            { ownerId: userId },
            { accessGrants: { some: { participantUserId: userId, status: "active" } } },
          ],
        },
        include: {
          ...accessibleGroupInclude,
          accessGrants: {
            where: { participantUserId: userId, status: "active" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
    },

    async create(ownerId: string, input: { name: string; avatarIds: string[] }) {
      return db.$transaction(async (tx) => {
        await lockAvatarAgents(tx, input.avatarIds);
        await lockAccessGrants(tx, await findMemberGrantIds(tx, ownerId, input.avatarIds));
        const members = await resolveMembers(tx, ownerId, input.avatarIds);
        return tx.avatarGroup.create({
          data: {
            ownerId,
            name: input.name,
            members: { create: members },
          },
          include: groupInclude,
        });
      });
    },

    async update(ownerId: string, groupId: string, input: { name?: string; avatarIds?: string[] }) {
      return db.$transaction(async (tx) => {
        await lockAvatarGroups(tx, [groupId]);
        await lockGroupSharingChannels(tx, groupId);
        const snapshot = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId, deletedAt: null },
          include: {
            members: {
              select: { avatarAgentId: true },
              orderBy: { position: "asc" },
            },
          },
        });
        if (!snapshot) throw new NotFoundError("Grupo no encontrado");
        await lockAvatarAgents(tx, [
          ...snapshot.members.map((member) => member.avatarAgentId),
          ...(input.avatarIds ?? []),
        ]);
        await lockAccessGrants(
          tx,
          await findMemberGrantIds(tx, ownerId, [
            ...snapshot.members.map((member) => member.avatarAgentId),
            ...(input.avatarIds ?? []),
          ])
        );
        const group = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId, deletedAt: null },
        });
        if (!group) throw new NotFoundError("Grupo no encontrado");

        const requestedAvatarIds = input.avatarIds;
        const membershipChanged = Boolean(
          requestedAvatarIds &&
          !sameOrderedIds(
            requestedAvatarIds,
            snapshot.members.map((member) => member.avatarAgentId)
          )
        );
        const members =
          membershipChanged && requestedAvatarIds
            ? await resolveMembers(tx, ownerId, requestedAvatarIds)
            : null;
        if (members) {
          const hasActiveSharingChannels =
            (await tx.groupShareLink.count({
              where: { avatarGroupId: groupId, isEnabled: true, deletedAt: null },
            })) +
              (await tx.groupAccessGrant.count({
                where: { avatarGroupId: groupId, status: "active" },
              })) >
            0;
          if (members.some((member) => member.accessGrantId !== null) && hasActiveSharingChannels) {
            throw new GroupSharingIneligibleError(
              "No podés agregar avatares ajenos mientras el grupo tenga accesos compartidos activos"
            );
          }
          await tx.avatarGroupMember.deleteMany({ where: { avatarGroupId: groupId } });
        }

        return tx.avatarGroup
          .update({
            where: { id: groupId },
            data: {
              ...(input.name ? { name: input.name } : {}),
              ...(members ? { members: { create: members } } : {}),
              ...(members ? { membershipVersion: { increment: 1 } } : {}),
            },
            include: groupInclude,
          })
          .then(async (updated) => {
            if (members && !members.some((member) => member.accessGrantId !== null)) {
              await enqueueSharedGroupPreparation(tx, updated);
            }
            return updated;
          });
      });
    },

    async delete(ownerId: string, groupId: string) {
      return db.$transaction(async (tx) => {
        await lockAvatarGroups(tx, [groupId]);
        await lockGroupSharingChannels(tx, groupId);
        const snapshot = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId, deletedAt: null },
          include: { members: { select: { avatarAgentId: true } } },
        });
        if (!snapshot) throw new NotFoundError("Grupo no encontrado");
        const activeSessionIds = await tx.groupVoiceSession.findMany({
          where: { avatarGroupId: groupId, status: { in: ["connecting", "active"] } },
          select: { id: true },
        });
        await lockGroupVoiceSessions(
          tx,
          activeSessionIds.map((session) => session.id)
        );
        await lockAvatarAgents(
          tx,
          snapshot.members.map((member) => member.avatarAgentId)
        );
        await lockAccessGrants(
          tx,
          await findMemberGrantIds(
            tx,
            ownerId,
            snapshot.members.map((member) => member.avatarAgentId)
          )
        );
        const group = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId, deletedAt: null },
        });
        if (!group) throw new NotFoundError("Grupo no encontrado");
        await terminateGroupVoiceSessionsForDeletion(tx, {
          sessionIds: activeSessionIds.map((session) => session.id),
          errorMessage: "avatar_group_deleted",
        });
        const deletedAt = new Date();
        await Promise.all([
          tx.groupShareLink.updateMany({
            where: { avatarGroupId: groupId, deletedAt: null },
            data: { isEnabled: false, deletedAt },
          }),
          tx.groupAccessGrant.updateMany({
            where: { avatarGroupId: groupId, status: "active" },
            data: { status: "revoked", revokedAt: deletedAt },
          }),
        ]);
        return tx.avatarGroup.update({ where: { id: groupId }, data: { deletedAt } });
      });
    },

    async createVoiceSession(ownerId: string, groupId: string, maxMinutes = 10) {
      return db.$transaction(async (tx) => {
        await lockAvatarGroups(tx, [groupId]);
        const snapshot = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId, deletedAt: null },
          include: groupInclude,
        });
        if (!snapshot) throw new NotFoundError("Grupo no encontrado");
        await lockAvatarAgents(
          tx,
          snapshot.members.map((member) => member.avatarAgentId)
        );
        await lockAccessGrants(
          tx,
          await findMemberGrantIds(
            tx,
            ownerId,
            snapshot.members.map((member) => member.avatarAgentId)
          )
        );
        const group = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId, deletedAt: null },
          include: groupInclude,
        });
        if (!group) throw new NotFoundError("Grupo no encontrado");

        const availableMembers = group.members.filter(
          (member) =>
            member.avatarAgent.status === "active" &&
            (member.avatarAgent.ownerId === ownerId ||
              (member.accessGrant?.status === "active" && member.accessGrant.participantUserId === ownerId))
        );
        if (availableMembers.length < 2) {
          throw new NotFoundError("El grupo necesita al menos dos participantes disponibles");
        }
        const resolved = await resolveMembers(
          tx,
          ownerId,
          availableMembers.map((member) => member.avatarAgentId)
        );
        const primary = availableMembers[0]!;
        const rosterSnapshot = availableMembers.map((member) => ({
          id: member.avatarAgent.id,
          name: member.avatarAgent.name,
          description: member.avatarAgent.description,
          thumbnailUrl: avatarThumbnailUrl(member.avatarAgent.liveAvatarConfig),
          position: member.position,
        }));

        const conversation = await tx.conversation.create({
          data: {
            ownerId,
            avatarAgentId: primary.avatarAgentId,
            avatarGroupId: group.id,
            avatarGroupOwnerIdSnapshot: group.ownerId,
            avatarGroupNameSnapshot: group.name,
            groupMembershipVersion: group.membershipVersion,
            avatarGroupRosterSnapshot: rosterSnapshot,
            visibility: "private",
            mode: "voice",
            conversationAvatars: { create: resolved },
            groupParticipantSnapshots: {
              create: toParticipantSnapshots(availableMembers),
            },
          },
        });
        const session = await tx.groupVoiceSession.create({
          data: {
            avatarGroupId: group.id,
            conversationId: conversation.id,
            ownerId,
            initiatorUserId: ownerId,
            expiresAt: new Date(Date.now() + maxMinutes * 60_000),
            participants: {
              create: resolved.map((member) => ({ avatarAgentId: member.avatarAgentId })),
            },
          },
          include: {
            participants: {
              include: { avatarAgent: { include: avatarWithKnowledgeInclude } },
              orderBy: { createdAt: "asc" },
            },
            avatarGroup: true,
          },
        });

        return session;
      });
    },

    async createSharedVoiceSession(
      initiatorUserId: string,
      groupId: string,
      consent: { scopeId: string; version: string } | null,
      maxMinutes = 60,
      capacity?: { maxConcurrentPerParticipant: number; maxConcurrentPerAvatar: number }
    ) {
      return db.$transaction(async (tx) => {
        await lockAvatarGroups(tx, [groupId]);
        const grantSnapshot = await tx.groupAccessGrant.findFirst({
          where: {
            avatarGroupId: groupId,
            participantUserId: initiatorUserId,
            status: "active",
            avatarGroup: { is: { deletedAt: null } },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (!grantSnapshot) throw new NotFoundError("Grupo no encontrado");
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "GroupAccessGrant" WHERE "id" = ${grantSnapshot.id} FOR UPDATE`
        );
        const grant = await tx.groupAccessGrant.findFirst({
          where: {
            id: grantSnapshot.id,
            avatarGroupId: groupId,
            participantUserId: initiatorUserId,
            status: "active",
          },
        });
        if (!grant) throw new NotFoundError("Grupo no encontrado");
        const participantEmail = normalizeExternalParticipantEmail(grant.participantEmail);
        const group = await lockAndReadStrictSharedGroup(tx, groupId, grant.ownerId);
        if (!group || group.ownerId !== grant.ownerId) throw new NotFoundError("Grupo no encontrado");
        if (
          !consent ||
          consent.scopeId !== groupConsentScopeId("access-grant", grant.id) ||
          consent.version !== String(group.membershipVersion)
        ) {
          throw new GroupConsentVersionStaleError();
        }
        await tx.groupAccessConsent.upsert({
          where: {
            groupAccessGrantId_participantUserId_membershipVersion: {
              groupAccessGrantId: grant.id,
              participantUserId: initiatorUserId,
              membershipVersion: group.membershipVersion,
            },
          },
          create: {
            groupAccessGrantId: grant.id,
            participantUserId: initiatorUserId,
            scopeId: consent.scopeId,
            membershipVersion: group.membershipVersion,
          },
          update: { scopeId: consent.scopeId, consentedAt: new Date() },
        });
        await assertGroupUsageAvailable(tx, {
          groupAccessGrantId: grant.id,
          maxSessionsPer24Hours: grant.maxSessionsPer24Hours,
        });
        if (capacity) {
          await assertGroupExternalCapacity(tx, {
            participantEmail,
            avatarIds: group.members.map((member) => member.avatarAgentId),
            ...capacity,
          });
        }
        const seconds = effectiveGroupSessionSeconds(maxMinutes, grant.maxSessionDurationSeconds);
        const expiresAt = new Date(Date.now() + seconds * 1000);
        const rosterSnapshot = toRosterSnapshot(group.members);
        const primary = group.members[0]!;
        const conversation = await tx.conversation.create({
          data: {
            ownerId: initiatorUserId,
            avatarAgentId: primary.avatarAgentId,
            avatarGroupId: group.id,
            groupAccessGrantId: grant.id,
            participantEmail,
            avatarGroupOwnerIdSnapshot: group.ownerId,
            avatarGroupNameSnapshot: group.name,
            groupMembershipVersion: group.membershipVersion,
            avatarGroupRosterSnapshot: rosterSnapshot,
            visibility: "private",
            mode: "voice",
            conversationAvatars: {
              create: group.members.map((member) => ({
                avatarAgentId: member.avatarAgentId,
                position: member.position,
              })),
            },
            groupParticipantSnapshots: {
              create: toParticipantSnapshots(group.members),
            },
          },
        });
        return tx.groupVoiceSession.create({
          data: {
            avatarGroupId: group.id,
            conversationId: conversation.id,
            ownerId: group.ownerId,
            initiatorUserId,
            groupAccessGrantId: grant.id,
            expiresAt,
            participants: {
              create: group.members.map((member) => ({ avatarAgentId: member.avatarAgentId })),
            },
          },
          include: {
            participants: {
              include: { avatarAgent: { include: avatarWithKnowledgeInclude } },
              orderBy: { createdAt: "asc" },
            },
            avatarGroup: true,
          },
        });
      });
    },

    async createPublicVoiceSession(input: {
      shareLinkId: string;
      participantEmail: string;
      consentedAt: Date;
      consentScopeId: string;
      consentVersion: number;
      maxMinutes?: number;
      capacity?: { maxConcurrentPerParticipant: number; maxConcurrentPerAvatar: number };
    }) {
      return db.$transaction(async (tx) => {
        const linkSnapshot = await tx.groupShareLink.findFirst({
          where: {
            id: input.shareLinkId,
            isEnabled: true,
            deletedAt: null,
            avatarGroupId: { not: null },
            avatarGroup: { is: { deletedAt: null } },
          },
          select: { avatarGroupId: true },
        });
        if (!linkSnapshot?.avatarGroupId) throw new NotFoundError("Public group not found");
        await lockAvatarGroups(tx, [linkSnapshot.avatarGroupId]);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "GroupShareLink" WHERE "id" = ${input.shareLinkId} FOR UPDATE`
        );
        const link = await tx.groupShareLink.findFirst({
          where: {
            id: input.shareLinkId,
            avatarGroupId: linkSnapshot.avatarGroupId,
            isEnabled: true,
            deletedAt: null,
          },
        });
        if (!link?.avatarGroupId) throw new NotFoundError("Public group not found");
        const participantEmail = normalizeExternalParticipantEmail(input.participantEmail);
        const group = await lockAndReadStrictSharedGroup(tx, link.avatarGroupId, link.ownerId);
        if (group.membershipVersion !== input.consentVersion) {
          throw new GroupConsentVersionStaleError();
        }
        if (input.consentScopeId !== groupConsentScopeId("share-link", link.id)) {
          throw new GroupConsentVersionStaleError();
        }
        await assertGroupUsageAvailable(tx, {
          groupShareLinkId: link.id,
          participantEmail,
          maxSessionsPer24Hours: link.maxSessionsPer24Hours,
        });
        if (input.capacity) {
          await assertGroupExternalCapacity(tx, {
            participantEmail,
            avatarIds: group.members.map((member) => member.avatarAgentId),
            ...input.capacity,
          });
        }
        const seconds = effectiveGroupSessionSeconds(input.maxMinutes ?? 60, link.maxSessionDurationSeconds);
        const expiresAt = new Date(Date.now() + seconds * 1000);
        const participant = await tx.user.findUnique({
          where: { email: participantEmail },
          select: { id: true },
        });
        const publicSession = await tx.groupPublicSession.create({
          data: {
            groupShareLinkId: link.id,
            avatarGroupId: group.id,
            participantEmail,
            participantUserId: participant?.id ?? null,
            consentScopeId: input.consentScopeId,
            consentVersion: input.consentVersion,
            consentedAt: input.consentedAt,
            expiresAt,
            avatarGroupOwnerIdSnapshot: group.ownerId,
            avatarGroupNameSnapshot: group.name,
            groupMembershipVersion: group.membershipVersion,
          },
        });
        const rosterSnapshot = toRosterSnapshot(group.members);
        const primary = group.members[0]!;
        const conversation = await tx.conversation.create({
          data: {
            avatarAgentId: primary.avatarAgentId,
            avatarGroupId: group.id,
            groupPublicSessionId: publicSession.id,
            groupShareLinkId: link.id,
            participantEmail,
            avatarGroupOwnerIdSnapshot: group.ownerId,
            avatarGroupNameSnapshot: group.name,
            groupMembershipVersion: group.membershipVersion,
            avatarGroupRosterSnapshot: rosterSnapshot,
            visibility: "public",
            mode: "voice",
            conversationAvatars: {
              create: group.members.map((member) => ({
                avatarAgentId: member.avatarAgentId,
                position: member.position,
              })),
            },
            groupParticipantSnapshots: {
              create: toParticipantSnapshots(group.members),
            },
          },
        });
        const voiceSession = await tx.groupVoiceSession.create({
          data: {
            avatarGroupId: group.id,
            conversationId: conversation.id,
            ownerId: group.ownerId,
            groupPublicSessionId: publicSession.id,
            expiresAt,
            participants: {
              create: group.members.map((member) => ({ avatarAgentId: member.avatarAgentId })),
            },
          },
          include: {
            participants: {
              include: { avatarAgent: { include: avatarWithKnowledgeInclude } },
              orderBy: { createdAt: "asc" },
            },
            avatarGroup: true,
          },
        });
        return { publicSession, voiceSession };
      });
    },

    async findVoiceSessionForOwner(ownerId: string, sessionId: string) {
      const session = await db.groupVoiceSession.findFirst({
        where: { id: sessionId, ...sessionPrincipalWhere(ownerId) },
        include: {
          avatarGroup: {
            include: {
              members: { select: { avatarAgentId: true, position: true }, orderBy: { position: "asc" } },
            },
          },
          conversation: {
            include: {
              messages: { orderBy: { createdAt: "asc" } },
              conversationAvatars: {
                select: { avatarAgentId: true, position: true },
                orderBy: { position: "asc" },
              },
            },
          },
          participants: {
            include: {
              avatarAgent: { include: avatarWithKnowledgeInclude },
              realtimeSession: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!session) return null;
      const positions = new Map(
        session.conversation.conversationAvatars.map((member) => [member.avatarAgentId, member.position])
      );
      session.participants.sort(
        (left, right) =>
          (positions.get(left.avatarAgentId) ?? Number.MAX_SAFE_INTEGER) -
            (positions.get(right.avatarAgentId) ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)
      );
      return session;
    },

    findConversationForCreator(userId: string, conversationId: string) {
      return db.conversation.findFirst({
        where: {
          id: conversationId,
          ...groupConversationHistoryAccess(userId),
        },
        include: {
          avatarGroup: true,
          conversationAvatars: {
            include: { avatarAgent: true },
            orderBy: { position: "asc" },
          },
          groupParticipantSnapshots: { orderBy: { position: "asc" } },
          messages: {
            include: { speakerAvatar: true, groupParticipantSnapshot: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    },

    listConversationsForCreator(userId: string) {
      return db.conversation.findMany({
        where: {
          ...groupConversationHistoryAccess(userId),
        },
        include: {
          avatarGroup: true,
          conversationAvatars: {
            include: { avatarAgent: true },
            orderBy: { position: "asc" },
          },
          groupParticipantSnapshots: { orderBy: { position: "asc" } },
          _count: { select: { messages: true } },
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      });
    },

    createRealtimeParticipant(participantId: string, conversationId: string, avatarAgentId: string) {
      return db.$transaction(async (tx) => {
        const current = await tx.groupVoiceParticipant.findUnique({
          where: { id: participantId },
          include: { realtimeSession: true, groupVoiceSession: true },
        });
        if (!current || current.status !== "connecting") throw new ConditionalParticipantClaimError();
        if (current.realtimeSession) {
          await enqueueSessionCleanup(tx, {
            realtimeSessionId: current.realtimeSession.id,
            providerSessionTokenCiphertext: current.realtimeSession.providerSessionTokenCiphertext,
            ownerId: current.groupVoiceSession.ownerId,
            avatarAgentId: current.avatarAgentId,
          });
          await tx.realtimeSession.updateMany({
            where: { id: current.realtimeSession.id, status: { in: ["connecting", "active", "errored"] } },
            data: { status: "ended", endedAt: new Date() },
          });
        }
        const realtime = await tx.realtimeSession.create({ data: { conversationId, avatarAgentId } });
        const linked = await tx.groupVoiceParticipant.updateMany({
          where: {
            id: participantId,
            status: "connecting",
            realtimeSessionId: current.realtimeSessionId,
            groupVoiceSession: { status: { in: ["connecting", "active"] } },
          },
          data: { realtimeSessionId: realtime.id, errorMessage: null, endedAt: null },
        });
        if (linked.count !== 1) throw new ConditionalParticipantClaimError();
        return tx.groupVoiceParticipant.findUniqueOrThrow({
          where: { id: participantId },
          include: {
            avatarAgent: { include: avatarWithKnowledgeInclude },
            realtimeSession: true,
          },
        });
      });
    },

    activateParticipantConnection(
      participantId: string,
      participantAttemptId: string,
      providerSessionId: string | null,
      token: string
    ) {
      return db.$transaction(async (tx) => {
        const locator = await tx.groupVoiceParticipant.findUnique({
          where: { id: participantId },
          select: { groupVoiceSessionId: true },
        });
        if (locator) await lockGroupVoiceSessions(tx, [locator.groupVoiceSessionId]);
        const current = await tx.groupVoiceParticipant.findUnique({
          where: { id: participantId },
          include: { groupVoiceSession: true },
        });
        const participant = await tx.groupVoiceParticipant.updateMany({
          where: {
            id: participantId,
            status: "connecting",
            realtimeSessionId: participantAttemptId,
            groupVoiceSession: { status: { in: ["connecting", "active"] } },
          },
          data: { status: "active", errorMessage: null, endedAt: null },
        });
        if (participant.count === 1) {
          await tx.realtimeSession.update({
            where: { id: participantAttemptId },
            data: {
              providerSessionId,
              providerSessionTokenCiphertext: token,
              errorMessage: null,
              endedAt: null,
            },
          });
          return true;
        }
        await tx.realtimeSession.updateMany({
          where: { id: participantAttemptId },
          data: {
            status: "ended",
            providerSessionId,
            providerSessionTokenCiphertext: token,
            endedAt: new Date(),
          },
        });
        await enqueueSessionCleanup(tx, {
          realtimeSessionId: participantAttemptId,
          providerSessionTokenCiphertext: token,
          ownerId: current?.groupVoiceSession.ownerId,
          avatarAgentId: current?.avatarAgentId,
        });
        return false;
      });
    },

    confirmParticipantStarted(
      ownerId: string,
      sessionId: string,
      avatarId: string,
      participantAttemptId: string
    ) {
      return db.$transaction(async (tx) => {
        await lockGroupVoiceSessions(tx, [sessionId]);
        const participant = await tx.groupVoiceParticipant.findFirst({
          where: {
            groupVoiceSessionId: sessionId,
            avatarAgentId: avatarId,
            realtimeSessionId: participantAttemptId,
            status: "active",
            groupVoiceSession: {
              ...sessionPrincipalWhere(ownerId),
              status: { in: ["connecting", "active"] },
            },
          },
          select: { id: true },
        });
        if (!participant) return false;

        const activatedAt = new Date();
        const transition = await tx.realtimeSession.updateMany({
          where: {
            id: participantAttemptId,
            status: { in: ["connecting", "active"] },
            activatedAt: null,
          },
          data: { status: "active", activatedAt },
        });
        if (transition.count === 1) return true;

        const current = await tx.realtimeSession.findUnique({
          where: { id: participantAttemptId },
          select: { status: true, activatedAt: true },
        });
        return current?.status === "active" && current.activatedAt !== null;
      });
    },

    abandonParticipantConnection(
      participantId: string,
      participantAttemptId: string,
      providerSessionId: string | null,
      token: string,
      errorMessage: string
    ) {
      return db.$transaction(async (tx) => {
        const locator = await tx.groupVoiceParticipant.findUnique({
          where: { id: participantId },
          select: { groupVoiceSessionId: true },
        });
        if (!locator) return;
        await lockGroupVoiceSessions(tx, [locator.groupVoiceSessionId]);
        const current = await tx.groupVoiceParticipant.findUnique({
          where: { id: participantId },
          include: { groupVoiceSession: true },
        });
        if (!current || current.groupVoiceSessionId !== locator.groupVoiceSessionId) return;
        await tx.groupVoiceParticipant.updateMany({
          where: {
            id: participantId,
            realtimeSessionId: participantAttemptId,
            status: "connecting",
          },
          data: { status: "errored", errorMessage, endedAt: new Date() },
        });
        await tx.realtimeSession.updateMany({
          where: { id: participantAttemptId },
          data: {
            status: "errored",
            providerSessionId,
            providerSessionTokenCiphertext: token,
            errorMessage,
            endedAt: new Date(),
          },
        });
        await enqueueSessionCleanup(tx, {
          realtimeSessionId: participantAttemptId,
          providerSessionTokenCiphertext: token,
          ownerId: current?.groupVoiceSession.ownerId,
          avatarAgentId: current?.avatarAgentId,
        });
      });
    },

    async markParticipantErrored(participantId: string, participantAttemptId: string, errorMessage: string) {
      return db.$transaction(async (tx) => {
        const participant = await tx.groupVoiceParticipant.updateMany({
          where: {
            id: participantId,
            realtimeSessionId: participantAttemptId,
            status: "connecting",
          },
          data: { status: "errored", errorMessage, endedAt: new Date() },
        });
        if (participant.count === 1) {
          await tx.realtimeSession.updateMany({
            where: { id: participantAttemptId },
            data: { status: "errored", errorMessage, endedAt: new Date() },
          });
        }
        return participant.count === 1;
      });
    },

    async beginParticipantRetry(ownerId: string, sessionId: string, avatarId: string) {
      return db.$transaction(async (tx) => {
        await lockGroupVoiceSessions(tx, [sessionId]);
        const current = await tx.groupVoiceParticipant.findFirst({
          where: {
            groupVoiceSessionId: sessionId,
            avatarAgentId: avatarId,
            groupVoiceSession: {
              ...sessionPrincipalWhere(ownerId),
              status: { in: ["connecting", "active"] },
            },
          },
          include: { realtimeSession: true, groupVoiceSession: true },
        });
        if (!current) throw new NotFoundError("Participante no encontrado");
        const claimed = await tx.groupVoiceParticipant.updateMany({
          where: {
            id: current.id,
            status: "errored",
            realtimeSessionId: current.realtimeSessionId,
            groupVoiceSession: {
              ...sessionPrincipalWhere(ownerId),
              status: { in: ["connecting", "active"] },
            },
          },
          data: { status: "connecting", errorMessage: null, endedAt: null },
        });
        if (claimed.count !== 1) return null;
        if (current.realtimeSession) {
          await enqueueSessionCleanup(tx, {
            realtimeSessionId: current.realtimeSession.id,
            providerSessionTokenCiphertext: current.realtimeSession.providerSessionTokenCiphertext,
            ownerId: current.groupVoiceSession.ownerId,
            avatarAgentId: avatarId,
          });
          await tx.realtimeSession.updateMany({
            where: { id: current.realtimeSession.id },
            data: { status: "ended", endedAt: new Date() },
          });
        }
        const realtime = await tx.realtimeSession.create({
          data: { conversationId: current.groupVoiceSession.conversationId, avatarAgentId: avatarId },
        });
        await tx.groupVoiceParticipant.update({
          where: { id: current.id },
          data: { realtimeSessionId: realtime.id },
        });
        return tx.groupVoiceParticipant.findUniqueOrThrow({
          where: { id: current.id },
          include: {
            avatarAgent: { include: avatarWithKnowledgeInclude },
            realtimeSession: true,
          },
        });
      });
    },

    async failParticipant(
      ownerId: string,
      sessionId: string,
      avatarId: string,
      input: {
        sourceEventId: string;
        reason: string;
        participantAttemptId: string;
        expectedTurnId?: string;
      },
      leaseMs = 75_000
    ) {
      try {
        return await db.$transaction(async (tx) => {
          await lockGroupVoiceSessions(tx, [sessionId]);
          const session = await tx.groupVoiceSession.findFirst({
            where: { id: sessionId, ...sessionPrincipalWhere(ownerId) },
          });
          if (!session) throw new NotFoundError("Llamada grupal no encontrada");
          const participant = await tx.groupVoiceParticipant.findFirst({
            where: { groupVoiceSessionId: sessionId, avatarAgentId: avatarId },
            include: { realtimeSession: true },
          });
          if (!participant) throw new NotFoundError("Participante no encontrado");
          const duplicate = await tx.groupVoiceParticipantFailureEvent.findFirst({
            where: { groupVoiceSessionId: sessionId, sourceEventId: input.sourceEventId },
          });
          if (duplicate) {
            return { kind: "duplicate" as const, session, participant, next: null };
          }
          await tx.groupVoiceParticipantFailureEvent.create({
            data: {
              groupVoiceSessionId: sessionId,
              sourceEventId: input.sourceEventId,
              avatarAgentId: avatarId,
              participantAttemptId: input.participantAttemptId,
              expectedTurnId: input.expectedTurnId ?? null,
              reason: input.reason,
            },
          });
          if (participant.realtimeSessionId !== input.participantAttemptId) {
            return { kind: "stale" as const, session, participant, next: null };
          }
          if (participant.status === "errored" || participant.status === "ended") {
            return { kind: "duplicate" as const, session, participant, next: null };
          }
          const participantClaim = await tx.groupVoiceParticipant.updateMany({
            where: {
              id: participant.id,
              groupVoiceSessionId: sessionId,
              realtimeSessionId: input.participantAttemptId,
              status: { in: ["connecting", "active"] },
            },
            data: { status: "errored", errorMessage: input.reason, endedAt: new Date() },
          });
          if (participantClaim.count !== 1) {
            return { kind: "duplicate" as const, session, participant, next: null };
          }
          if (participant.realtimeSessionId) {
            await enqueueSessionCleanup(tx, {
              realtimeSessionId: participant.realtimeSessionId,
              providerSessionTokenCiphertext:
                participant.realtimeSession?.providerSessionTokenCiphertext ?? null,
              ownerId: session.ownerId,
              avatarAgentId: avatarId,
            });
            await tx.realtimeSession.updateMany({
              where: { id: participant.realtimeSessionId },
              data: { status: "errored", errorMessage: input.reason, endedAt: new Date() },
            });
          }
          await tx.groupPlannedTurn.updateMany({
            where: {
              avatarAgentId: avatarId,
              status: "queued",
              round: {
                groupVoiceSessionId: sessionId,
                status: { in: ["deliberating", "queued", "speaking"] },
              },
            },
            data: { status: "skipped", completedAt: new Date() },
          });

          const erroredParticipant = {
            ...participant,
            status: "errored" as const,
            errorMessage: input.reason,
          };
          if (!session.floorTurnId || session.floorOwnerAvatarId !== avatarId) {
            return {
              kind: "degraded" as const,
              session,
              participant: erroredParticipant,
              next: null,
            };
          }
          const turn = await tx.groupPlannedTurn.findFirst({
            where: {
              id: session.floorTurnId,
              avatarAgentId: avatarId,
              round: { groupVoiceSessionId: sessionId },
            },
            include: { round: true },
          });
          if (!turn || !["queued", "speaking"].includes(session.orchestrationPhase)) {
            const released = await tx.groupVoiceSession.updateMany({
              where: {
                id: sessionId,
                ...sessionPrincipalWhere(ownerId),
                floorTurnId: session.floorTurnId,
                floorOwnerAvatarId: avatarId,
                orchestrationPhase: session.orchestrationPhase,
              },
              data: {
                orchestrationPhase: "listening",
                floorOwnerAvatarId: null,
                floorTurnId: null,
                floorLeaseExpiresAt: null,
              },
            });
            return {
              kind: released.count === 1 ? ("completed" as const) : ("stale" as const),
              session,
              participant: erroredParticipant,
              next: null,
            };
          }

          const committing = await tx.groupVoiceSession.updateMany({
            where: {
              id: sessionId,
              ...sessionPrincipalWhere(ownerId),
              floorTurnId: turn.id,
              floorOwnerAvatarId: avatarId,
              orchestrationPhase: { in: ["queued", "speaking"] },
            },
            data: { orchestrationPhase: "committing" },
          });
          if (committing.count !== 1) {
            return {
              kind: "stale" as const,
              session,
              participant: erroredParticipant,
              next: null,
            };
          }
          await tx.groupPlannedTurn.updateMany({
            where: { id: turn.id, status: { in: ["claimed", "speaking"] } },
            data: { status: "failed", completedAt: new Date() },
          });

          const activeParticipants = await tx.groupVoiceParticipant.findMany({
            where: { groupVoiceSessionId: sessionId, status: "active" },
            select: { avatarAgentId: true },
          });
          const next = await tx.groupPlannedTurn.findFirst({
            where: {
              roundId: turn.roundId,
              status: "queued",
              avatarAgentId: { in: activeParticipants.map(({ avatarAgentId }) => avatarAgentId) },
            },
            orderBy: { position: "asc" },
            include: { avatarAgent: true, round: true },
          });
          if (!next) {
            const completedAt = new Date();
            const completedRound = await tx.groupVoiceRound.updateMany({
              where: { id: turn.roundId, status: { in: ["queued", "speaking"] } },
              data: { status: "completed", completedAt },
            });
            if (completedRound.count !== 1) throw new ConditionalFloorClaimError();
            const released = await tx.groupVoiceSession.updateMany({
              where: {
                id: sessionId,
                ...sessionPrincipalWhere(ownerId),
                orchestrationPhase: "committing",
                floorTurnId: turn.id,
                floorOwnerAvatarId: avatarId,
              },
              data: {
                orchestrationPhase: "listening",
                floorOwnerAvatarId: null,
                floorTurnId: null,
                floorLeaseExpiresAt: null,
              },
            });
            if (released.count !== 1) throw new ConditionalFloorClaimError();
            return {
              kind: "completed" as const,
              session,
              participant: erroredParticipant,
              next: null,
            };
          }

          const leaseExpiresAt = new Date(Date.now() + leaseMs);
          const nextClaim = await tx.groupPlannedTurn.updateMany({
            where: { id: next.id, status: "queued" },
            data: { status: "claimed" },
          });
          if (nextClaim.count !== 1) throw new ConditionalFloorClaimError();
          const queuedRound = await tx.groupVoiceRound.updateMany({
            where: { id: turn.roundId, status: { in: ["queued", "speaking"] } },
            data: { status: "queued" },
          });
          if (queuedRound.count !== 1) throw new ConditionalFloorClaimError();
          const advanced = await tx.groupVoiceSession.updateMany({
            where: {
              id: sessionId,
              ...sessionPrincipalWhere(ownerId),
              orchestrationPhase: "committing",
              floorTurnId: turn.id,
              floorOwnerAvatarId: avatarId,
            },
            data: {
              orchestrationPhase: "queued",
              floorOwnerAvatarId: next.avatarAgentId,
              floorTurnId: next.id,
              floorLeaseExpiresAt: leaseExpiresAt,
            },
          });
          if (advanced.count !== 1) throw new ConditionalFloorClaimError();
          return {
            kind: "next" as const,
            session,
            participant: erroredParticipant,
            next: { turn: next, leaseExpiresAt },
          };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const [session, participant, receipt] = await Promise.all([
          db.groupVoiceSession.findFirst({
            where: { id: sessionId, ...sessionPrincipalWhere(ownerId) },
          }),
          db.groupVoiceParticipant.findFirst({
            where: { groupVoiceSessionId: sessionId, avatarAgentId: avatarId },
            include: { realtimeSession: true },
          }),
          db.groupVoiceParticipantFailureEvent.findFirst({
            where: { groupVoiceSessionId: sessionId, sourceEventId: input.sourceEventId },
          }),
        ]);
        if (!session) throw new NotFoundError("Llamada grupal no encontrada");
        if (!participant) throw new NotFoundError("Participante no encontrado");
        if (!receipt) throw error;
        return { kind: "duplicate" as const, session, participant, next: null };
      }
    },

    updateGroupProvider(
      avatarId: string,
      input: {
        agentId?: string;
        fingerprint?: string;
        revision?: string | null;
        status: "not_synced" | "syncing" | "synced" | "failed";
        error?: string | null;
      },
      expectedRevision?: string | null
    ) {
      const data = {
        groupProviderSyncStatus: input.status,
        ...(input.agentId !== undefined ? { groupProviderAgentId: input.agentId } : {}),
        ...(input.fingerprint !== undefined ? { groupProviderSyncFingerprint: input.fingerprint } : {}),
        ...(input.revision !== undefined ? { groupProviderSyncRevision: input.revision } : {}),
        ...(input.error !== undefined ? { groupProviderSyncError: input.error } : {}),
        ...(input.status === "synced" ? { groupProviderSyncedAt: new Date() } : {}),
      };
      if (expectedRevision === undefined) {
        return db.avatarAgent.update({ where: { id: avatarId }, data }).then(() => true);
      }
      return db.avatarAgent
        .updateMany({
          where: { id: avatarId, groupProviderSyncRevision: expectedRevision },
          data,
        })
        .then((updated) => updated.count === 1);
    },

    async beginRound(ownerId: string, sessionId: string, input: { sourceEventId: string; content: string }) {
      try {
        return await db.$transaction(async (tx) => {
          await lockGroupVoiceSessions(tx, [sessionId]);
          const session = await tx.groupVoiceSession.findFirst({
            where: {
              id: sessionId,
              ...sessionPrincipalWhere(ownerId),
              status: { in: ["connecting", "active"] },
            },
          });
          if (!session) throw new NotFoundError("Llamada grupal no encontrada");
          const existing = await tx.groupVoiceRound.findFirst({
            where: { groupVoiceSessionId: sessionId, sourceEventId: input.sourceEventId },
            include: { plannedTurns: { orderBy: { position: "asc" } } },
          });
          if (existing) return { kind: "duplicate" as const, round: existing };
          const claimed = await tx.groupVoiceSession.updateMany({
            where: {
              id: sessionId,
              ...sessionPrincipalWhere(ownerId),
              orchestrationPhase: "listening",
              floorTurnId: null,
            },
            data: { orchestrationPhase: "deliberating", contextVersion: { increment: 1 } },
          });
          if (claimed.count !== 1) return { kind: "busy" as const, session };

          const message = await tx.message.create({
            data: {
              conversationId: session.conversationId,
              role: "user",
              content: input.content,
              sourceEventId: input.sourceEventId,
              metadata: { source: "scribe", final: true },
            },
          });
          await tx.conversation.update({
            where: { id: session.conversationId },
            data: { lastMessageAt: message.createdAt },
          });
          const round = await tx.groupVoiceRound.create({
            data: {
              groupVoiceSessionId: sessionId,
              userMessageId: message.id,
              sourceEventId: input.sourceEventId,
              intent: "pending",
              contextVersion: session.contextVersion + 1,
            },
            include: { plannedTurns: true },
          });
          return { kind: "created" as const, round };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const round = await db.groupVoiceRound.findFirst({
          where: { groupVoiceSessionId: sessionId, sourceEventId: input.sourceEventId },
          include: { plannedTurns: { orderBy: { position: "asc" } } },
        });
        if (!round) throw error;
        return { kind: "duplicate" as const, round };
      }
    },

    async queueRound(
      sessionId: string,
      roundId: string,
      input: {
        intent: string;
        routingPlan: unknown;
        turns: Array<{ avatarAgentId: string; position: number; instructionText: string }>;
        fallbackTurns?: Array<{ avatarAgentId: string; position: number; instructionText: string }>;
      },
      leaseMs = 75_000
    ) {
      try {
        return await db.$transaction(async (tx) => {
          await lockGroupVoiceSessions(tx, [sessionId]);
          const requestedIds = [
            ...input.turns.map((turn) => turn.avatarAgentId),
            ...(input.fallbackTurns ?? []).map((turn) => turn.avatarAgentId),
          ];
          const activeParticipants = await tx.groupVoiceParticipant.findMany({
            where: {
              groupVoiceSessionId: sessionId,
              avatarAgentId: { in: requestedIds },
              status: "active",
            },
            select: { avatarAgentId: true },
          });
          const activeIds = new Set(activeParticipants.map(({ avatarAgentId }) => avatarAgentId));
          const eligiblePrimaryTurns = input.turns.filter((turn) => activeIds.has(turn.avatarAgentId));
          const primaryDropped = eligiblePrimaryTurns.length !== input.turns.length;
          const selectedIds = new Set(eligiblePrimaryTurns.map((turn) => turn.avatarAgentId));
          const targetCount = Math.max(
            input.turns.length,
            input.intent === "collective"
              ? activeIds.size
              : input.intent === "debate" || input.intent === "comparison"
                ? Math.min(2, activeIds.size)
                : Math.min(1, activeIds.size)
          );
          const eligibleFallbackTurns = (input.intent === "named" ? [] : (input.fallbackTurns ?? [])).filter(
            (turn) => activeIds.has(turn.avatarAgentId) && !selectedIds.has(turn.avatarAgentId)
          );
          const eligibleTurns = [
            ...eligiblePrimaryTurns,
            ...eligibleFallbackTurns.slice(0, Math.max(0, targetCount - eligiblePrimaryTurns.length)),
          ].map((turn, position) => ({ ...turn, position }));
          const usedFallback = eligibleTurns.some(
            (turn) => !input.turns.some((primary) => primary.avatarAgentId === turn.avatarAgentId)
          );
          const routingPlan = withActualRoutingPlan(
            input.routingPlan,
            eligibleTurns,
            usedFallback,
            primaryDropped
          );

          if (eligibleTurns.length === 0) {
            const failedRound = await tx.groupVoiceRound.updateMany({
              where: { id: roundId, groupVoiceSessionId: sessionId, status: "deliberating" },
              data: {
                status: "failed",
                intent: input.intent,
                routingPlan,
                completedAt: new Date(),
              },
            });
            if (failedRound.count !== 1) return null;
            const released = await tx.groupVoiceSession.updateMany({
              where: {
                id: sessionId,
                orchestrationPhase: "deliberating",
                floorOwnerAvatarId: null,
                floorTurnId: null,
              },
              data: {
                orchestrationPhase: "listening",
                floorLeaseExpiresAt: null,
              },
            });
            if (released.count !== 1) throw new ConditionalFloorClaimError();
            return null;
          }

          const roundClaim = await tx.groupVoiceRound.updateMany({
            where: { id: roundId, groupVoiceSessionId: sessionId, status: "deliberating" },
            data: {
              status: "queued",
              intent: input.intent,
              routingPlan,
            },
          });
          if (roundClaim.count !== 1) return null;
          await tx.groupPlannedTurn.createMany({
            data: eligibleTurns.map((turn) => ({ ...turn, roundId })),
          });
          const first = await tx.groupPlannedTurn.findFirst({
            where: { roundId, status: "queued" },
            orderBy: { position: "asc" },
          });
          if (!first) throw new ConditionalFloorClaimError();
          const leaseExpiresAt = new Date(Date.now() + leaseMs);
          const floor = await tx.groupVoiceSession.updateMany({
            where: {
              id: sessionId,
              orchestrationPhase: "deliberating",
              floorOwnerAvatarId: null,
              floorTurnId: null,
            },
            data: {
              orchestrationPhase: "queued",
              floorOwnerAvatarId: first.avatarAgentId,
              floorTurnId: first.id,
              floorLeaseExpiresAt: leaseExpiresAt,
            },
          });
          if (floor.count !== 1) throw new ConditionalFloorClaimError();
          const turnClaim = await tx.groupPlannedTurn.updateMany({
            where: { id: first.id, roundId, status: "queued" },
            data: { status: "claimed" },
          });
          if (turnClaim.count !== 1) throw new ConditionalFloorClaimError();
          const turn = await tx.groupPlannedTurn.findUnique({
            where: { id: first.id },
            include: { avatarAgent: true, round: true },
          });
          if (!turn) throw new ConditionalFloorClaimError();
          return { turn, leaseExpiresAt };
        });
      } catch (error) {
        if (error instanceof ConditionalFloorClaimError) return null;
        throw error;
      }
    },

    async currentDirectiveState(ownerId: string, sessionId: string) {
      return db.$transaction(async (tx) => {
        await lockGroupVoiceSessions(tx, [sessionId]);
        const session = await tx.groupVoiceSession.findFirst({
          where: { id: sessionId, ...sessionPrincipalWhere(ownerId) },
        });
        if (!session?.floorTurnId) return { session, turn: null };
        const turn = await tx.groupPlannedTurn.findFirst({
          where: {
            id: session.floorTurnId,
            ...(session.floorOwnerAvatarId ? { avatarAgentId: session.floorOwnerAvatarId } : {}),
            round: { groupVoiceSessionId: sessionId },
          },
          include: { avatarAgent: true, round: true },
        });
        return { session, turn };
      });
    },

    findPlannedTurn(turnId: string) {
      return db.groupPlannedTurn.findUnique({
        where: { id: turnId },
        include: { avatarAgent: true, round: { include: { groupVoiceSession: true } } },
      });
    },

    async recordProviderEvent(
      ownerId: string,
      sessionId: string,
      input: {
        sourceEventId: string;
        turnId: string | null;
        avatarId: string;
        type:
          | "agent_response"
          | "agent_response_correction"
          | "speak_started"
          | "speak_ended"
          | "interruption";
        content?: string;
      },
      leaseMs = 75_000
    ) {
      try {
        return await db.$transaction(async (tx) => {
          await lockGroupVoiceSessions(tx, [sessionId]);
          const session = await tx.groupVoiceSession.findFirst({
            where: { id: sessionId, ...sessionPrincipalWhere(ownerId) },
          });
          if (!session) throw new NotFoundError("Llamada grupal no encontrada");
          const duplicate = await tx.groupVoiceProviderEvent.findFirst({
            where: { groupVoiceSessionId: sessionId, sourceEventId: input.sourceEventId },
          });
          if (duplicate) return { kind: "duplicate" as const, session, next: null };
          const turn = input.turnId
            ? await tx.groupPlannedTurn.findFirst({
                where: {
                  id: input.turnId,
                  avatarAgentId: input.avatarId,
                  round: { groupVoiceSessionId: sessionId },
                },
                include: { round: true },
              })
            : null;
          if (!turn) {
            return {
              kind: "unauthorized" as const,
              reason: "unknown_turn" as const,
              session,
              next: null,
            };
          }

          const now = new Date();
          const ownsFloor =
            session.floorTurnId === turn.id &&
            session.floorOwnerAvatarId === input.avatarId &&
            Boolean(session.floorLeaseExpiresAt && session.floorLeaseExpiresAt > now);
          const responseText = input.content?.trim() || null;
          const persistAuthorizedEvent = () =>
            tx.groupVoiceProviderEvent.create({
              data: {
                groupVoiceSessionId: sessionId,
                sourceEventId: input.sourceEventId,
                avatarAgentId: input.avatarId,
                turnId: turn.id,
                type: input.type,
                ...(input.content ? { payload: { content: input.content } } : {}),
              },
            });

          if (input.type === "agent_response" || input.type === "agent_response_correction") {
            if (turn.status === "completed") {
              await persistAuthorizedEvent();
              if (responseText) {
                const lateUpdate = await tx.groupPlannedTurn.updateMany({
                  where: {
                    id: turn.id,
                    status: "completed",
                    ...(input.type === "agent_response" ? { responseText: null } : {}),
                  },
                  data: { responseText },
                });
                if (lateUpdate.count === 1) {
                  await upsertAssistantTurnMessage(tx, session.conversationId, turn, responseText);
                  const rollingSummary = await buildCanonicalRollingSummary(tx, sessionId);
                  await tx.groupVoiceSession.updateMany({
                    where: { id: sessionId },
                    data: { rollingSummary },
                  });
                }
              }
              return { kind: "late_updated" as const, session, next: null };
            }
            if (!ownsFloor || !["claimed", "speaking"].includes(turn.status)) {
              return {
                kind: "unauthorized" as const,
                reason: "invalid_lease" as const,
                session,
                next: null,
              };
            }
            if (input.type === "agent_response" && turn.responseText) {
              await persistAuthorizedEvent();
              return { kind: "accepted" as const, session, next: null };
            }
            const responseUpdate = await tx.groupPlannedTurn.updateMany({
              where: {
                id: turn.id,
                status: { in: ["claimed", "speaking"] },
                ...(input.type === "agent_response" ? { responseText: null } : {}),
              },
              data: { ...(responseText ? { responseText } : {}) },
            });
            if (responseUpdate.count !== 1) {
              return {
                kind: "unauthorized" as const,
                reason: "invalid_turn_state" as const,
                session,
                next: null,
              };
            }
            await persistAuthorizedEvent();
            return { kind: "accepted" as const, session, next: null };
          }

          if (input.type === "speak_started") {
            if (
              !ownsFloor ||
              !["claimed", "speaking"].includes(turn.status) ||
              !["queued", "speaking"].includes(session.orchestrationPhase)
            ) {
              return {
                kind: "unauthorized" as const,
                reason: "invalid_lease" as const,
                session,
                next: null,
              };
            }
            const leaseExpiresAt = new Date(Date.now() + leaseMs);
            const floorClaim = await tx.groupVoiceSession.updateMany({
              where: {
                id: sessionId,
                ...sessionPrincipalWhere(ownerId),
                floorTurnId: turn.id,
                floorOwnerAvatarId: input.avatarId,
                floorLeaseExpiresAt: { gt: now },
                orchestrationPhase: { in: ["queued", "speaking"] },
              },
              data: { orchestrationPhase: "speaking", floorLeaseExpiresAt: leaseExpiresAt },
            });
            if (floorClaim.count !== 1) {
              return {
                kind: "unauthorized" as const,
                reason: "invalid_lease" as const,
                session,
                next: null,
              };
            }
            const turnClaim = await tx.groupPlannedTurn.updateMany({
              where: { id: turn.id, status: { in: ["claimed", "speaking"] } },
              data: { status: "speaking", startedAt: turn.startedAt ?? now },
            });
            if (turnClaim.count !== 1) throw new ConditionalFloorClaimError();
            const roundClaim = await tx.groupVoiceRound.updateMany({
              where: { id: turn.roundId, status: { in: ["queued", "speaking"] } },
              data: { status: "speaking" },
            });
            if (roundClaim.count !== 1) throw new ConditionalFloorClaimError();
            await persistAuthorizedEvent();
            return {
              kind: "accepted" as const,
              session: {
                ...session,
                orchestrationPhase: "speaking" as const,
                floorLeaseExpiresAt: leaseExpiresAt,
              },
              next: null,
            };
          }

          if (input.type === "interruption") {
            if (!ownsFloor || turn.status !== "speaking" || session.orchestrationPhase !== "speaking") {
              return {
                kind: "unauthorized" as const,
                reason: "invalid_turn_state" as const,
                session,
                next: null,
              };
            }
            const interrupted = await cancelRoundTransaction(tx, sessionId, turn.roundId, {
              principalId: ownerId,
              avatarId: input.avatarId,
              turnId: turn.id,
              phases: ["speaking"],
              leaseAfter: now,
            });
            if (interrupted) await persistAuthorizedEvent();
            return interrupted
              ? { kind: "interrupted" as const, session, next: null }
              : {
                  kind: "unauthorized" as const,
                  reason: "invalid_turn_state" as const,
                  session,
                  next: null,
                };
          }

          if (!ownsFloor || turn.status !== "speaking" || session.orchestrationPhase !== "speaking") {
            return {
              kind: "unauthorized" as const,
              reason: "invalid_turn_state" as const,
              session,
              next: null,
            };
          }

          const committingClaim = await tx.groupVoiceSession.updateMany({
            where: {
              id: sessionId,
              ...sessionPrincipalWhere(ownerId),
              orchestrationPhase: "speaking",
              floorTurnId: turn.id,
              floorOwnerAvatarId: input.avatarId,
              floorLeaseExpiresAt: { gt: now },
            },
            data: { orchestrationPhase: "committing" },
          });
          if (committingClaim.count !== 1) {
            return {
              kind: "unauthorized" as const,
              reason: "invalid_lease" as const,
              session,
              next: null,
            };
          }
          await persistAuthorizedEvent();

          const completedAt = new Date();
          const latestCorrection = await tx.groupVoiceProviderEvent.findFirst({
            where: {
              groupVoiceSessionId: sessionId,
              turnId: turn.id,
              type: "agent_response_correction",
            },
            orderBy: { createdAt: "desc" },
            select: { payload: true },
          });
          const correctionText = readProviderEventContent(latestCorrection?.payload);
          const actualResponse = correctionText ?? responseText ?? turn.responseText?.trim() ?? null;
          const completionClaim = await tx.groupPlannedTurn.updateMany({
            where: { id: turn.id, status: "speaking" },
            data: { status: "completed", completedAt, responseText: actualResponse },
          });
          if (completionClaim.count !== 1) throw new ConditionalFloorClaimError();
          if (actualResponse) {
            await upsertAssistantTurnMessage(tx, session.conversationId, turn, actualResponse);
          }

          const activeParticipants = await tx.groupVoiceParticipant.findMany({
            where: { groupVoiceSessionId: sessionId, status: "active" },
            select: { avatarAgentId: true },
          });
          const activeAvatarIds = activeParticipants.map(({ avatarAgentId }) => avatarAgentId);
          const next = await tx.groupPlannedTurn.findFirst({
            where: {
              roundId: turn.roundId,
              status: "queued",
              avatarAgentId: { in: activeAvatarIds },
            },
            orderBy: { position: "asc" },
            include: { avatarAgent: true, round: true },
          });
          if (!next) {
            const roundCompletion = await tx.groupVoiceRound.updateMany({
              where: { id: turn.roundId, status: { in: ["queued", "speaking"] } },
              data: { status: "completed", completedAt },
            });
            if (roundCompletion.count !== 1) throw new ConditionalFloorClaimError();
            const rollingSummary = await buildCanonicalRollingSummary(tx, sessionId);
            const released = await tx.groupVoiceSession.updateMany({
              where: {
                id: sessionId,
                ...sessionPrincipalWhere(ownerId),
                orchestrationPhase: "committing",
                floorTurnId: turn.id,
                floorOwnerAvatarId: input.avatarId,
              },
              data: {
                orchestrationPhase: "listening",
                floorOwnerAvatarId: null,
                floorTurnId: null,
                floorLeaseExpiresAt: null,
                rollingSummary,
              },
            });
            if (released.count !== 1) throw new ConditionalFloorClaimError();
            return { kind: "completed" as const, session, next: null };
          }

          const leaseExpiresAt = new Date(Date.now() + leaseMs);
          const nextClaim = await tx.groupPlannedTurn.updateMany({
            where: { id: next.id, status: "queued" },
            data: { status: "claimed" },
          });
          if (nextClaim.count !== 1) throw new ConditionalFloorClaimError();
          const queuedRound = await tx.groupVoiceRound.updateMany({
            where: { id: turn.roundId, status: { in: ["speaking", "queued"] } },
            data: { status: "queued" },
          });
          if (queuedRound.count !== 1) throw new ConditionalFloorClaimError();
          const advanced = await tx.groupVoiceSession.updateMany({
            where: {
              id: sessionId,
              ...sessionPrincipalWhere(ownerId),
              orchestrationPhase: "committing",
              floorTurnId: turn.id,
              floorOwnerAvatarId: input.avatarId,
            },
            data: {
              orchestrationPhase: "queued",
              floorOwnerAvatarId: next.avatarAgentId,
              floorTurnId: next.id,
              floorLeaseExpiresAt: leaseExpiresAt,
            },
          });
          if (advanced.count !== 1) throw new ConditionalFloorClaimError();
          return { kind: "next" as const, session, next: { turn: next, leaseExpiresAt } };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const [session, duplicate] = await Promise.all([
          db.groupVoiceSession.findFirst({
            where: { id: sessionId, ...sessionPrincipalWhere(ownerId) },
          }),
          db.groupVoiceProviderEvent.findFirst({
            where: { groupVoiceSessionId: sessionId, sourceEventId: input.sourceEventId },
          }),
        ]);
        if (!session) throw new NotFoundError("Llamada grupal no encontrada");
        if (!duplicate) throw error;
        return { kind: "duplicate" as const, session, next: null };
      }
    },

    async interruptRound(
      ownerId: string,
      sessionId: string,
      expected: { avatarId?: string; turnId?: string } = {}
    ) {
      return db.$transaction(async (tx) => {
        await lockGroupVoiceSessions(tx, [sessionId]);
        const session = await tx.groupVoiceSession.findFirst({
          where: { id: sessionId, ...sessionPrincipalWhere(ownerId) },
        });
        if (!session) throw new NotFoundError("Llamada grupal no encontrada");
        if (
          (expected.avatarId !== undefined && session.floorOwnerAvatarId !== expected.avatarId) ||
          (expected.turnId !== undefined && session.floorTurnId !== expected.turnId)
        ) {
          return { kind: "stale" as const, session, avatarId: session.floorOwnerAvatarId };
        }
        const turn = session.floorTurnId
          ? await tx.groupPlannedTurn.findUnique({ where: { id: session.floorTurnId } })
          : null;
        if (turn && session.floorOwnerAvatarId) {
          const phase = session.orchestrationPhase;
          if (!isFloorPhase(phase)) {
            return { kind: "stale" as const, session, avatarId: session.floorOwnerAvatarId };
          }
          const interrupted = await cancelRoundTransaction(tx, sessionId, turn.roundId, {
            principalId: ownerId,
            avatarId: session.floorOwnerAvatarId,
            turnId: turn.id,
            phases: [phase],
          });
          return interrupted
            ? { kind: "interrupted" as const, session, avatarId: session.floorOwnerAvatarId }
            : { kind: "stale" as const, session, avatarId: session.floorOwnerAvatarId };
        }

        if (expected.avatarId !== undefined || expected.turnId !== undefined) {
          return { kind: "stale" as const, session, avatarId: null };
        }
        const round = await tx.groupVoiceRound.findFirst({
          where: {
            groupVoiceSessionId: sessionId,
            status: { in: ["deliberating", "queued", "speaking"] },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!round || session.orchestrationPhase === "listening") {
          return { kind: "idle" as const, session, avatarId: null };
        }
        const cancelled = await tx.groupVoiceRound.updateMany({
          where: { id: round.id, status: { in: ["deliberating", "queued", "speaking"] } },
          data: { status: "cancelled", completedAt: new Date() },
        });
        if (cancelled.count !== 1) return { kind: "stale" as const, session, avatarId: null };
        const released = await tx.groupVoiceSession.updateMany({
          where: {
            id: sessionId,
            ...sessionPrincipalWhere(ownerId),
            orchestrationPhase: session.orchestrationPhase,
            floorOwnerAvatarId: null,
            floorTurnId: null,
          },
          data: { orchestrationPhase: "listening", floorLeaseExpiresAt: null },
        });
        if (released.count !== 1) throw new ConditionalFloorClaimError();
        await tx.groupPlannedTurn.updateMany({
          where: { roundId: round.id, status: { in: ["queued", "claimed", "speaking"] } },
          data: { status: "interrupted", completedAt: new Date() },
        });
        return { kind: "interrupted" as const, session, avatarId: null };
      });
    },

    heartbeat(ownerId: string, sessionId: string) {
      return db.groupVoiceSession.updateMany({
        where: {
          id: sessionId,
          ...sessionPrincipalWhere(ownerId),
          status: { in: ["connecting", "active"] },
        },
        data: { lastHeartbeatAt: new Date() },
      });
    },

    async markSessionActive(sessionId: string) {
      return db.$transaction(async (tx) => {
        const locator = await tx.groupVoiceSession.findUnique({
          where: { id: sessionId },
          select: {
            avatarGroupId: true,
            groupAccessGrantId: true,
            groupPublicSessionId: true,
          },
        });
        if (!locator) return false;
        if (locator.avatarGroupId) {
          await lockAvatarGroups(tx, [locator.avatarGroupId]);
          if (locator.groupAccessGrantId || locator.groupPublicSessionId) {
            await lockGroupSharingChannels(tx, locator.avatarGroupId);
          }
        }
        await lockGroupVoiceSessions(tx, [sessionId]);
        const session = await tx.groupVoiceSession.findUnique({
          where: { id: sessionId },
          include: {
            participants: {
              select: {
                status: true,
                realtimeSession: { select: { activatedAt: true } },
                avatarAgent: {
                  select: {
                    status: true,
                    groupProviderAgentId: true,
                    groupProviderSyncStatus: true,
                  },
                },
              },
            },
            avatarGroup: { select: { deletedAt: true, membershipVersion: true } },
            conversation: { select: { groupMembershipVersion: true } },
            groupAccessGrant: { select: { avatarGroupId: true, status: true } },
            groupPublicSession: {
              select: {
                status: true,
                expiresAt: true,
                groupShareLinkId: true,
                groupShareLink: {
                  select: { avatarGroupId: true, isEnabled: true, deletedAt: true },
                },
              },
            },
          },
        });
        if (!session) return false;
        if (
          session.avatarGroupId !== locator.avatarGroupId ||
          session.groupAccessGrantId !== locator.groupAccessGrantId ||
          session.groupPublicSessionId !== locator.groupPublicSessionId
        ) {
          if (session.status === "connecting") {
            await terminateGroupVoiceSessionsForDeletion(tx, {
              sessionIds: [sessionId],
              errorMessage: "sharing_target_changed_before_activation",
            });
          }
          return false;
        }
        if (session.status === "active" && session.activatedAt) return true;
        if (session.status !== "connecting" || session.activatedAt) return false;
        const activatedAt = new Date();
        const external = Boolean(session.groupAccessGrantId || session.groupPublicSessionId);
        const rosterShapeValid = session.participants.length >= 2 && session.participants.length <= 3;
        const accountTargetActive = Boolean(
          session.groupAccessGrantId &&
          session.groupAccessGrant?.status === "active" &&
          session.groupAccessGrant.avatarGroupId === session.avatarGroupId
        );
        const publicTargetActive = Boolean(
          session.groupPublicSessionId &&
          session.groupPublicSession?.status === "active" &&
          session.groupPublicSession.expiresAt > activatedAt &&
          session.groupPublicSession.groupShareLink?.avatarGroupId === session.avatarGroupId &&
          session.groupPublicSession.groupShareLink.isEnabled &&
          session.groupPublicSession.groupShareLink.deletedAt === null
        );
        const externalRosterStillCurrent = Boolean(
          session.avatarGroup &&
          rosterShapeValid &&
          session.avatarGroup.deletedAt === null &&
          session.conversation.groupMembershipVersion === session.avatarGroup.membershipVersion &&
          session.participants.every(
            (participant) =>
              participant.avatarAgent.status === "active" &&
              participant.avatarAgent.groupProviderSyncStatus === "synced" &&
              participant.avatarAgent.groupProviderAgentId !== null
          )
        );
        if (
          session.expiresAt <= activatedAt ||
          !rosterShapeValid ||
          (external && (!(accountTargetActive || publicTargetActive) || !externalRosterStillCurrent))
        ) {
          await terminateGroupVoiceSessionsForDeletion(tx, {
            sessionIds: [sessionId],
            errorMessage: "sharing_target_invalid_before_activation",
          });
          return false;
        }
        const confirmed = session.participants.filter(
          (participant) =>
            participant.status === "active" && Boolean(participant.realtimeSession?.activatedAt)
        ).length;
        const required = external ? session.participants.length : Math.min(2, session.participants.length);
        if (confirmed < required) return false;
        const activated = await tx.groupVoiceSession.updateMany({
          where: { id: sessionId, status: "connecting", activatedAt: null },
          data: { status: "active", activatedAt, lastHeartbeatAt: activatedAt },
        });
        if (activated.count !== 1) return false;
        const shareLinkId = session.groupPublicSession?.groupShareLinkId;
        if (shareLinkId) {
          await tx.groupShareLink.updateMany({
            where: { id: shareLinkId, deletedAt: null },
            data: { lastUsedAt: activatedAt },
          });
        }
        if (session.groupAccessGrantId) {
          await tx.groupAccessGrant.updateMany({
            where: { id: session.groupAccessGrantId, status: "active" },
            data: { lastUsedAt: activatedAt },
          });
        }
        return true;
      });
    },

    async endSession(ownerId: string, sessionId: string, status: "ended" | "errored" = "ended") {
      return db.$transaction(async (tx) => {
        await lockGroupVoiceSessions(tx, [sessionId]);
        const session = await tx.groupVoiceSession.findFirst({
          where: { id: sessionId, ...sessionPrincipalWhere(ownerId) },
          include: { participants: { include: { realtimeSession: true } } },
        });
        if (!session) throw new NotFoundError("Llamada grupal no encontrada");
        const endedAt = new Date();
        for (const participant of session.participants) {
          if (!participant.realtimeSession) continue;
          await enqueueSessionCleanup(tx, {
            realtimeSessionId: participant.realtimeSession.id,
            providerSessionTokenCiphertext: participant.realtimeSession.providerSessionTokenCiphertext,
            ownerId: session.ownerId,
            avatarAgentId: participant.avatarAgentId,
          });
        }
        const completedAt = new Date();
        await tx.groupPlannedTurn.updateMany({
          where: {
            round: { groupVoiceSessionId: sessionId },
            status: { in: ["queued", "claimed", "speaking"] },
          },
          data: { status: "interrupted", completedAt },
        });
        await tx.groupVoiceRound.updateMany({
          where: {
            groupVoiceSessionId: sessionId,
            status: { in: ["deliberating", "queued", "speaking"] },
          },
          data: { status: "cancelled", completedAt },
        });
        if (session.status === "ended" || session.status === "errored") return session;
        await tx.groupVoiceParticipant.updateMany({
          where: { groupVoiceSessionId: sessionId, status: { in: ["connecting", "active"] } },
          data: { status: "ended", endedAt },
        });
        await tx.realtimeSession.updateMany({
          where: { groupVoiceParticipant: { groupVoiceSessionId: sessionId } },
          data: {
            status: "ended",
            endedAt,
          },
        });
        await tx.conversation.update({
          where: { id: session.conversationId },
          data: { status: "ended" },
        });
        if (session.groupPublicSessionId) {
          await tx.groupPublicSession.updateMany({
            where: { id: session.groupPublicSessionId, status: "active" },
            data: {
              status: status === "ended" ? "ended" : "errored",
              endedAt,
            },
          });
        }
        return tx.groupVoiceSession.update({
          where: { id: sessionId },
          data: {
            status,
            endedAt,
            orchestrationPhase: status === "ended" ? "ended" : "errored",
            floorOwnerAvatarId: null,
            floorTurnId: null,
            floorLeaseExpiresAt: null,
          },
          include: { participants: { include: { realtimeSession: true } } },
        });
      });
    },

    async recoverStaleDeliberatingRounds(cutoff: Date) {
      return db.$transaction(async (tx) => {
        const staleRounds = await tx.groupVoiceRound.findMany({
          where: { status: "deliberating", updatedAt: { lte: cutoff } },
          orderBy: { updatedAt: "asc" },
        });
        await lockGroupVoiceSessions(
          tx,
          staleRounds.map((round) => round.groupVoiceSessionId)
        );
        let recovered = 0;
        for (const round of staleRounds) {
          const failedRound = await tx.groupVoiceRound.updateMany({
            where: { id: round.id, status: "deliberating", updatedAt: { lte: cutoff } },
            data: { status: "failed", completedAt: new Date() },
          });
          if (failedRound.count !== 1) continue;
          const released = await tx.groupVoiceSession.updateMany({
            where: {
              id: round.groupVoiceSessionId,
              status: { in: ["connecting", "active"] },
              orchestrationPhase: "deliberating",
              floorOwnerAvatarId: null,
              floorTurnId: null,
              contextVersion: round.contextVersion,
            },
            data: { orchestrationPhase: "listening", floorLeaseExpiresAt: null },
          });
          recovered += released.count;
        }
        return recovered;
      });
    },

    listExpiredVoiceSessions(now: Date) {
      const connectingCutoff = new Date(now.getTime() - 5 * 60 * 1000);
      const heartbeatCutoff = new Date(now.getTime() - 2 * 60 * 1000);
      return db.groupVoiceSession.findMany({
        where: {
          status: { in: ["connecting", "active"] },
          OR: [
            { expiresAt: { lte: now } },
            { status: "connecting", startedAt: { lte: connectingCutoff } },
            { status: "active", lastHeartbeatAt: { lte: heartbeatCutoff } },
          ],
        },
        include: { participants: { include: { realtimeSession: true } } },
      });
    },

    async expireVoiceSessionIfStale(principalId: string, sessionId: string, now: Date) {
      const connectingCutoff = new Date(now.getTime() - 5 * 60 * 1000);
      const heartbeatCutoff = new Date(now.getTime() - 2 * 60 * 1000);
      return db.$transaction(async (tx) => {
        const claimed = await tx.groupVoiceSession.updateMany({
          where: {
            id: sessionId,
            ...sessionPrincipalWhere(principalId),
            status: { in: ["connecting", "active"] },
            OR: [
              { expiresAt: { lte: now } },
              { status: "connecting", startedAt: { lte: connectingCutoff } },
              { status: "active", lastHeartbeatAt: { lte: heartbeatCutoff } },
            ],
          },
          data: {
            status: "ended",
            endedAt: now,
            orchestrationPhase: "ended",
            floorOwnerAvatarId: null,
            floorTurnId: null,
            floorLeaseExpiresAt: null,
          },
        });
        if (claimed.count !== 1) return false;

        const session = await tx.groupVoiceSession.findUniqueOrThrow({ where: { id: sessionId } });
        await tx.groupPlannedTurn.updateMany({
          where: {
            round: { groupVoiceSessionId: sessionId },
            status: { in: ["queued", "claimed", "speaking"] },
          },
          data: { status: "interrupted", completedAt: now },
        });
        await tx.groupVoiceRound.updateMany({
          where: {
            groupVoiceSessionId: sessionId,
            status: { in: ["deliberating", "queued", "speaking"] },
          },
          data: { status: "cancelled", completedAt: now },
        });
        await tx.groupVoiceParticipant.updateMany({
          where: { groupVoiceSessionId: sessionId, status: { in: ["connecting", "active"] } },
          data: { status: "ended", endedAt: now },
        });
        await tx.realtimeSession.updateMany({
          where: { groupVoiceParticipant: { groupVoiceSessionId: sessionId } },
          data: { status: "ended", endedAt: now },
        });
        await tx.conversation.update({
          where: { id: session.conversationId },
          data: { status: "ended" },
        });
        if (session.groupPublicSessionId) {
          await tx.groupPublicSession.updateMany({
            where: { id: session.groupPublicSessionId, status: "active" },
            data: { status: "ended", endedAt: now },
          });
        }
        return true;
      });
    },

    async enqueuePendingSessionCleanups(limit = 100) {
      return db.$transaction(async (tx) => {
        const sessions = await tx.realtimeSession.findMany({
          where: {
            status: { in: ["ended", "errored"] },
            providerStoppedAt: null,
            providerSessionTokenCiphertext: { not: null },
          },
          orderBy: { endedAt: "asc" },
          take: limit,
          select: {
            id: true,
            avatarAgentId: true,
            providerSessionTokenCiphertext: true,
            conversation: { select: { ownerId: true } },
          },
        });
        let enqueued = 0;
        for (const session of sessions) {
          const job = await enqueueSessionCleanup(tx, {
            realtimeSessionId: session.id,
            providerSessionTokenCiphertext: session.providerSessionTokenCiphertext,
            ownerId: session.conversation?.ownerId,
            avatarAgentId: session.avatarAgentId,
          });
          if (job) enqueued += 1;
        }
        return enqueued;
      });
    },

    listExpiredFloorSessions(now: Date) {
      return db.groupVoiceSession.findMany({
        where: {
          status: "active",
          floorTurnId: { not: null },
          floorLeaseExpiresAt: { lte: now },
        },
      });
    },

    async expireFloor(sessionId: string, now: Date) {
      return db.$transaction(async (tx) => {
        await lockGroupVoiceSessions(tx, [sessionId]);
        const session = await tx.groupVoiceSession.findFirst({
          where: { id: sessionId, floorTurnId: { not: null }, floorLeaseExpiresAt: { lte: now } },
        });
        if (!session?.floorTurnId) return false;
        const turn = await tx.groupPlannedTurn.findUnique({ where: { id: session.floorTurnId } });
        if (!turn || !session.floorOwnerAvatarId || !isFloorPhase(session.orchestrationPhase)) {
          const released = await tx.groupVoiceSession.updateMany({
            where: {
              id: sessionId,
              floorTurnId: session.floorTurnId,
              floorOwnerAvatarId: session.floorOwnerAvatarId,
              floorLeaseExpiresAt: { lte: now },
            },
            data: {
              orchestrationPhase: "listening",
              floorOwnerAvatarId: null,
              floorTurnId: null,
              floorLeaseExpiresAt: null,
            },
          });
          return released.count === 1;
        }
        return cancelRoundTransaction(tx, sessionId, turn.roundId, {
          principalId: sessionPrincipalId(session),
          avatarId: session.floorOwnerAvatarId,
          turnId: turn.id,
          phases: [session.orchestrationPhase],
          leaseAtOrBefore: now,
        });
      });
    },

    listActiveVoiceSessionsForGroup(ownerId: string, groupId: string) {
      return db.groupVoiceSession.findMany({
        where: {
          ownerId,
          avatarGroupId: groupId,
          status: { in: ["connecting", "active"] },
        },
        include: { participants: { include: { realtimeSession: true } } },
      });
    },
  };
}

function groupConversationHistoryAccess(userId: string): Prisma.ConversationWhereInput {
  return {
    avatarGroupId: { not: null },
    OR: [
      {
        avatarGroupOwnerIdSnapshot: userId,
        OR: [
          { groupAccessGrantId: null, groupPublicSessionId: null },
          { groupVoiceSession: { is: { activatedAt: { not: null } } } },
        ],
      },
      {
        ownerId: userId,
        visibility: "private",
        groupAccessGrantId: { not: null },
        groupAccessGrant: { is: { participantUserId: userId, status: "active" } },
        groupVoiceSession: { is: { activatedAt: { not: null } } },
      },
      {
        ownerId: userId,
        visibility: "private",
        groupAccessGrantId: null,
        groupPublicSessionId: null,
      },
    ],
  };
}

type FloorPhase = "queued" | "speaking" | "committing";

function isFloorPhase(phase: string): phase is FloorPhase {
  return phase === "queued" || phase === "speaking" || phase === "committing";
}

async function cancelRoundTransaction(
  tx: Prisma.TransactionClient,
  sessionId: string,
  roundId: string,
  expected: {
    principalId: string;
    avatarId: string;
    turnId: string;
    phases: FloorPhase[];
    leaseAfter?: Date;
    leaseAtOrBefore?: Date;
  }
) {
  const completedAt = new Date();
  const released = await tx.groupVoiceSession.updateMany({
    where: {
      id: sessionId,
      ...sessionPrincipalWhere(expected.principalId),
      floorOwnerAvatarId: expected.avatarId,
      floorTurnId: expected.turnId,
      orchestrationPhase: { in: expected.phases },
      ...(expected.leaseAfter ? { floorLeaseExpiresAt: { gt: expected.leaseAfter } } : {}),
      ...(expected.leaseAtOrBefore ? { floorLeaseExpiresAt: { lte: expected.leaseAtOrBefore } } : {}),
    },
    data: {
      orchestrationPhase: "listening",
      floorOwnerAvatarId: null,
      floorTurnId: null,
      floorLeaseExpiresAt: null,
    },
  });
  if (released.count !== 1) return false;
  const cancelledRound = await tx.groupVoiceRound.updateMany({
    where: { id: roundId, status: { in: ["deliberating", "queued", "speaking"] } },
    data: { status: "cancelled", completedAt },
  });
  if (cancelledRound.count !== 1) throw new ConditionalFloorClaimError();
  await tx.groupPlannedTurn.updateMany({
    where: { roundId, status: { in: ["queued", "claimed", "speaking"] } },
    data: { status: "interrupted", completedAt },
  });
  return true;
}

async function upsertAssistantTurnMessage(
  tx: Prisma.TransactionClient,
  conversationId: string,
  turn: { id: string; avatarAgentId: string; instructionText: string },
  content: string
) {
  const participantSnapshot = await tx.groupConversationParticipantSnapshot.findUnique({
    where: {
      conversationId_sourceAvatarId: {
        conversationId,
        sourceAvatarId: turn.avatarAgentId,
      },
    },
    select: { id: true },
  });
  const message = await tx.message.upsert({
    where: {
      conversationId_sourceEventId: {
        conversationId,
        sourceEventId: `group-turn:${turn.id}`,
      },
    },
    create: {
      conversationId,
      role: "assistant",
      content,
      speakerAvatarId: turn.avatarAgentId,
      groupParticipantSnapshotId: participantSnapshot?.id ?? null,
      sourceEventId: `group-turn:${turn.id}`,
      metadata: { source: "elevenlabs_agent", instruction: turn.instructionText },
    },
    update: {
      content,
      speakerAvatarId: turn.avatarAgentId,
      groupParticipantSnapshotId: participantSnapshot?.id ?? null,
      metadata: { source: "elevenlabs_agent", instruction: turn.instructionText },
    },
  });
  await tx.conversation.updateMany({
    where: {
      id: conversationId,
      OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: message.createdAt } }],
    },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
}

async function buildCanonicalRollingSummary(tx: Prisma.TransactionClient, sessionId: string) {
  const rounds = await tx.groupVoiceRound.findMany({
    where: { groupVoiceSessionId: sessionId, status: "completed" },
    include: {
      userMessage: true,
      plannedTurns: { orderBy: { position: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rounds
    .flatMap((round) => [
      `Usuario: ${round.userMessage.content}`,
      ...round.plannedTurns.flatMap((turn) =>
        turn.responseText ? [`${turn.avatarAgentId}: ${turn.responseText}`] : []
      ),
    ])
    .join("\n")
    .slice(-12_000);
}

function assertStrictSharedRoster(group: {
  ownerId: string;
  members: Array<{
    accessGrantId: string | null;
    avatarAgent: {
      id: string;
      ownerId: string;
      status: string;
      liveAvatarConfig: unknown;
      voiceConfig: unknown;
      groupProviderAgentId: string | null;
      groupProviderSyncStatus: string;
    };
  }>;
}) {
  if (
    group.members.length < 2 ||
    group.members.length > 3 ||
    group.members.some(
      (member) => member.accessGrantId !== null || member.avatarAgent.ownerId !== group.ownerId
    )
  ) {
    throw new NotFoundError("El grupo compartido no tiene el roster completo disponible");
  }
  if (
    group.members.some(
      (member) =>
        member.avatarAgent.status !== "active" ||
        member.avatarAgent.groupProviderSyncStatus !== "synced" ||
        !member.avatarAgent.groupProviderAgentId ||
        !LiveAvatarConfigSchema.safeParse(member.avatarAgent.liveAvatarConfig).success ||
        !VoiceConfigSchema.safeParse(member.avatarAgent.voiceConfig).success
    )
  ) {
    throw new GroupVoiceRosterUnavailableError();
  }
}

async function lockAndReadStrictSharedGroup(
  tx: Prisma.TransactionClient,
  groupId: string,
  expectedOwnerId: string
) {
  const snapshot = await tx.avatarGroup.findFirst({
    where: { id: groupId, ownerId: expectedOwnerId, deletedAt: null },
    include: groupInclude,
  });
  if (!snapshot) throw new NotFoundError("Grupo compartido no encontrado");

  await lockAvatarAgents(
    tx,
    snapshot.members.map((member) => member.avatarAgentId)
  );
  const group = await tx.avatarGroup.findFirst({
    where: { id: groupId, ownerId: expectedOwnerId, deletedAt: null },
    include: groupInclude,
  });
  if (!group) throw new NotFoundError("Grupo compartido no encontrado");
  assertStrictSharedRoster(group);
  return group;
}

function toRosterSnapshot(
  members: Array<{
    position: number;
    avatarAgent: { id: string; name: string; description: string; liveAvatarConfig: unknown };
  }>
) {
  return members.map((member) => ({
    id: member.avatarAgent.id,
    name: member.avatarAgent.name,
    description: member.avatarAgent.description,
    thumbnailUrl: avatarThumbnailUrl(member.avatarAgent.liveAvatarConfig),
    position: member.position,
  }));
}

function toParticipantSnapshots(
  members: Array<{
    position: number;
    avatarAgent: { id: string; name: string; description: string; liveAvatarConfig: unknown };
  }>
) {
  return members.map((member) => ({
    sourceAvatarId: member.avatarAgent.id,
    name: member.avatarAgent.name,
    description: member.avatarAgent.description,
    thumbnailUrl: avatarThumbnailUrl(member.avatarAgent.liveAvatarConfig),
    position: member.position,
  }));
}

function avatarThumbnailUrl(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const thumbnailUrl = (config as Record<string, unknown>).thumbnailUrl;
  return typeof thumbnailUrl === "string" && thumbnailUrl.length > 0 ? thumbnailUrl : null;
}

function effectiveGroupSessionSeconds(maxMinutes: number, configuredSeconds: number | null) {
  const platformSeconds = Math.max(1, Math.min(60, maxMinutes)) * 60;
  return Math.max(10, Math.min(platformSeconds, configuredSeconds ?? platformSeconds));
}

async function assertGroupUsageAvailable(
  tx: Prisma.TransactionClient,
  input:
    | { groupAccessGrantId: string; maxSessionsPer24Hours: number | null }
    | {
        groupShareLinkId: string;
        participantEmail: string;
        maxSessionsPer24Hours: number | null;
      }
) {
  const activeWhere =
    "groupAccessGrantId" in input
      ? { groupAccessGrantId: input.groupAccessGrantId }
      : {
          groupPublicSession: {
            is: {
              groupShareLinkId: input.groupShareLinkId,
              participantEmail: input.participantEmail,
            },
          },
        };
  const active = await tx.groupVoiceSession.count({
    where: { ...activeWhere, status: { in: ["connecting", "active"] } },
  });
  if (active > 0) throw new GroupVoiceActiveSessionError();
  if (input.maxSessionsPer24Hours === null) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const usage = await tx.groupVoiceSession.findMany({
    where: {
      ...activeWhere,
      activatedAt: { gt: since },
    },
    select: { activatedAt: true },
    orderBy: { activatedAt: "asc" },
  });
  if (usage.length < input.maxSessionsPer24Hours) return;
  const firstCounted = usage[Math.max(0, usage.length - input.maxSessionsPer24Hours)]?.activatedAt;
  const retryAfterSeconds = firstCounted
    ? Math.max(1, Math.ceil((firstCounted.getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 1000))
    : 60;
  throw new GroupVoiceUsageLimitError(retryAfterSeconds);
}

async function assertGroupExternalCapacity(
  tx: Prisma.TransactionClient,
  input: {
    participantEmail: string;
    avatarIds: string[];
    maxConcurrentPerParticipant: number;
    maxConcurrentPerAvatar: number;
  }
) {
  const participantEmail = await lockExternalParticipant(tx, input.participantEmail);
  const participantActive = await countActiveExternalSessionsForParticipant(tx, participantEmail);
  if (participantActive >= Math.max(1, input.maxConcurrentPerParticipant)) {
    throw new GroupVoiceCapacityError();
  }

  for (const avatarId of [...new Set(input.avatarIds)].sort()) {
    const avatarActive = await countActiveExternalSessionsForAvatar(tx, avatarId);
    if (avatarActive >= Math.max(1, input.maxConcurrentPerAvatar)) {
      throw new GroupVoiceCapacityError();
    }
  }
}

async function lockGroupSharingChannels(tx: Prisma.TransactionClient, groupId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "GroupShareLink" WHERE "avatarGroupId" = ${groupId} ORDER BY "id" FOR UPDATE`
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "GroupAccessGrant" WHERE "avatarGroupId" = ${groupId} ORDER BY "id" FOR UPDATE`
  );
}

async function enqueueSharedGroupPreparation(
  tx: Prisma.TransactionClient,
  group: {
    id: string;
    ownerId: string;
    membershipVersion: number;
    members: Array<{
      avatarAgent: {
        id: string;
        status: string;
        updatedAt: Date;
        groupProviderAgentId: string | null;
        groupProviderSyncStatus: string;
      };
    }>;
  }
) {
  const hasSharing = await Promise.all([
    tx.groupShareLink.count({
      where: { avatarGroupId: group.id, isEnabled: true, deletedAt: null },
    }),
    tx.groupAccessGrant.count({ where: { avatarGroupId: group.id, status: "active" } }),
  ]).then(([links, grants]) => links + grants > 0);
  if (!hasSharing) return;
  for (const { avatarAgent: avatar } of group.members) {
    if (
      avatar.status !== "active" ||
      (avatar.groupProviderSyncStatus === "synced" && avatar.groupProviderAgentId)
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

export async function terminateGroupVoiceSessionsForDeletion(
  tx: Prisma.TransactionClient,
  input: {
    sessionIds: string[];
    errorMessage: string;
  }
) {
  const sessionIds = [...new Set(input.sessionIds)].sort();
  if (sessionIds.length === 0) return;
  await lockGroupVoiceSessions(tx, sessionIds);
  const sessions = await tx.groupVoiceSession.findMany({
    where: { id: { in: sessionIds } },
    include: { participants: { include: { realtimeSession: true } } },
  });
  const endedAt = new Date();
  for (const session of sessions) {
    for (const participant of session.participants) {
      const realtime = participant.realtimeSession;
      if (!realtime || realtime.providerStoppedAt) continue;
      await enqueueSessionCleanup(tx, {
        realtimeSessionId: realtime.id,
        providerSessionTokenCiphertext: realtime.providerSessionTokenCiphertext,
        ownerId: session.ownerId,
        avatarAgentId: participant.avatarAgentId,
      });
    }
    if (session.groupPublicSessionId) {
      await tx.groupPublicSession.updateMany({
        where: { id: session.groupPublicSessionId, status: "active" },
        data: { status: "errored", endedAt },
      });
    }
    if (session.status !== "connecting" && session.status !== "active") continue;
    await tx.groupPlannedTurn.updateMany({
      where: {
        round: { groupVoiceSessionId: session.id },
        status: { in: ["queued", "claimed", "speaking"] },
      },
      data: { status: "interrupted", completedAt: endedAt },
    });
    await tx.groupVoiceRound.updateMany({
      where: {
        groupVoiceSessionId: session.id,
        status: { in: ["deliberating", "queued", "speaking"] },
      },
      data: { status: "cancelled", completedAt: endedAt },
    });
    await tx.groupVoiceParticipant.updateMany({
      where: { groupVoiceSessionId: session.id, status: { in: ["connecting", "active"] } },
      data: { status: "ended", endedAt },
    });
    await tx.realtimeSession.updateMany({
      where: {
        groupVoiceParticipant: { groupVoiceSessionId: session.id },
        status: { in: ["connecting", "active"] },
      },
      data: { status: "ended", endedAt },
    });
    await tx.conversation.updateMany({
      where: { id: session.conversationId },
      data: { status: "ended" },
    });
    await tx.groupVoiceSession.updateMany({
      where: { id: session.id, status: { in: ["connecting", "active"] } },
      data: {
        status: "ended",
        endedAt,
        orchestrationPhase: "ended",
        floorOwnerAvatarId: null,
        floorTurnId: null,
        floorLeaseExpiresAt: null,
        errorMessage: input.errorMessage,
      },
    });
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function readProviderEventContent(payload: Prisma.JsonValue | null | undefined) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const content = (payload as Prisma.JsonObject).content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

function withActualRoutingPlan(
  routingPlan: unknown,
  turns: Array<{ avatarAgentId: string }>,
  usedFallback: boolean,
  primaryDropped: boolean
): Prisma.InputJsonValue {
  const base =
    typeof routingPlan === "object" && routingPlan !== null && !Array.isArray(routingPlan)
      ? (routingPlan as Record<string, unknown>)
      : {};
  return {
    ...base,
    speakerIds: turns.map((turn) => turn.avatarAgentId),
    ...(usedFallback ? { strategy: "fallback" } : {}),
    ...(usedFallback || primaryDropped
      ? {
          fallbackReason: "participant_degraded_during_deliberation",
        }
      : {}),
  } as Prisma.InputJsonObject;
}
