import { Prisma, type PrismaClient } from "@prisma/client";
import { NotFoundError } from "@yuni/domain";

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
        where: { ownerId },
        include: groupInclude,
        orderBy: { updatedAt: "desc" },
      });
    },

    findOwned(ownerId: string, groupId: string) {
      return db.avatarGroup.findFirst({ where: { id: groupId, ownerId }, include: groupInclude });
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
        const snapshot = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId },
          include: { members: { select: { avatarAgentId: true } } },
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
        await lockAvatarGroups(tx, [groupId]);
        const group = await tx.avatarGroup.findFirst({ where: { id: groupId, ownerId } });
        if (!group) throw new NotFoundError("Grupo no encontrado");

        const members = input.avatarIds ? await resolveMembers(tx, ownerId, input.avatarIds) : null;
        if (members) {
          await tx.avatarGroupMember.deleteMany({ where: { avatarGroupId: groupId } });
        }

        return tx.avatarGroup.update({
          where: { id: groupId },
          data: {
            ...(input.name ? { name: input.name } : {}),
            ...(members ? { members: { create: members } } : {}),
          },
          include: groupInclude,
        });
      });
    },

    async delete(ownerId: string, groupId: string) {
      return db.$transaction(async (tx) => {
        const snapshot = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId },
          include: { members: { select: { avatarAgentId: true } } },
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
        await lockAvatarGroups(tx, [groupId]);
        const group = await tx.avatarGroup.findFirst({ where: { id: groupId, ownerId } });
        if (!group) throw new NotFoundError("Grupo no encontrado");
        await endGroupSessionsForDeletion(tx, ownerId, groupId);
        await tx.avatarGroup.delete({ where: { id: groupId } });
        return group;
      });
    },

    async createVoiceSession(ownerId: string, groupId: string, maxMinutes = 10) {
      return db.$transaction(async (tx) => {
        const snapshot = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId },
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
        await lockAvatarGroups(tx, [groupId]);
        const group = await tx.avatarGroup.findFirst({
          where: { id: groupId, ownerId },
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

        const conversation = await tx.conversation.create({
          data: {
            ownerId,
            avatarAgentId: primary.avatarAgentId,
            avatarGroupId: group.id,
            visibility: "private",
            mode: "voice",
            conversationAvatars: { create: resolved },
          },
        });
        const session = await tx.groupVoiceSession.create({
          data: {
            avatarGroupId: group.id,
            conversationId: conversation.id,
            ownerId,
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

    async findVoiceSessionForOwner(ownerId: string, sessionId: string) {
      const session = await db.groupVoiceSession.findFirst({
        where: { id: sessionId, ownerId },
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
          conversationAvatars: { some: {} },
          OR: [{ ownerId: userId }, { conversationAvatars: { some: { avatarAgent: { ownerId: userId } } } }],
        },
        include: {
          avatarGroup: true,
          conversationAvatars: {
            include: { avatarAgent: true },
            orderBy: { position: "asc" },
          },
          messages: { include: { speakerAvatar: true }, orderBy: { createdAt: "asc" } },
        },
      });
    },

    listConversationsForCreator(userId: string) {
      return db.conversation.findMany({
        where: {
          conversationAvatars: { some: {} },
          OR: [{ ownerId: userId }, { conversationAvatars: { some: { avatarAgent: { ownerId: userId } } } }],
        },
        include: {
          avatarGroup: true,
          conversationAvatars: {
            include: { avatarAgent: true },
            orderBy: { position: "asc" },
          },
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
            groupVoiceSession: { ownerId, status: { in: ["connecting", "active"] } },
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
        const current = await tx.groupVoiceParticipant.findUnique({
          where: { id: participantId },
          include: { groupVoiceSession: true },
        });
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
            groupVoiceSession: { ownerId, status: { in: ["connecting", "active"] } },
          },
          include: { realtimeSession: true, groupVoiceSession: true },
        });
        if (!current) throw new NotFoundError("Participante no encontrado");
        const claimed = await tx.groupVoiceParticipant.updateMany({
          where: {
            id: current.id,
            status: "errored",
            realtimeSessionId: current.realtimeSessionId,
            groupVoiceSession: { ownerId, status: { in: ["connecting", "active"] } },
          },
          data: { status: "connecting", errorMessage: null, endedAt: null },
        });
        if (claimed.count !== 1) return null;
        if (current.realtimeSession) {
          await enqueueSessionCleanup(tx, {
            realtimeSessionId: current.realtimeSession.id,
            providerSessionTokenCiphertext: current.realtimeSession.providerSessionTokenCiphertext,
            ownerId,
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
          const session = await tx.groupVoiceSession.findFirst({ where: { id: sessionId, ownerId } });
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
              ownerId,
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
                ownerId,
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
              ownerId,
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
                ownerId,
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
              ownerId,
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
          db.groupVoiceSession.findFirst({ where: { id: sessionId, ownerId } }),
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
        status: "not_synced" | "syncing" | "synced" | "failed";
        error?: string | null;
      }
    ) {
      return db.avatarAgent.update({
        where: { id: avatarId },
        data: {
          groupProviderSyncStatus: input.status,
          ...(input.agentId !== undefined ? { groupProviderAgentId: input.agentId } : {}),
          ...(input.fingerprint !== undefined ? { groupProviderSyncFingerprint: input.fingerprint } : {}),
          ...(input.error !== undefined ? { groupProviderSyncError: input.error } : {}),
          ...(input.status === "synced" ? { groupProviderSyncedAt: new Date() } : {}),
        },
      });
    },

    async beginRound(ownerId: string, sessionId: string, input: { sourceEventId: string; content: string }) {
      try {
        return await db.$transaction(async (tx) => {
          await lockGroupVoiceSessions(tx, [sessionId]);
          const existing = await tx.groupVoiceRound.findFirst({
            where: { groupVoiceSessionId: sessionId, sourceEventId: input.sourceEventId },
            include: { plannedTurns: { orderBy: { position: "asc" } } },
          });
          if (existing) return { kind: "duplicate" as const, round: existing };

          const session = await tx.groupVoiceSession.findFirst({
            where: { id: sessionId, ownerId, status: { in: ["connecting", "active"] } },
          });
          if (!session) throw new NotFoundError("Llamada grupal no encontrada");
          const claimed = await tx.groupVoiceSession.updateMany({
            where: {
              id: sessionId,
              ownerId,
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
        const session = await tx.groupVoiceSession.findFirst({ where: { id: sessionId, ownerId } });
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
          const session = await tx.groupVoiceSession.findFirst({ where: { id: sessionId, ownerId } });
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
          await tx.groupVoiceProviderEvent.create({
            data: {
              groupVoiceSessionId: sessionId,
              sourceEventId: input.sourceEventId,
              avatarAgentId: input.avatarId,
              turnId: input.turnId,
              type: input.type,
              ...(input.content ? { payload: { content: input.content } } : {}),
            },
          });
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

          if (input.type === "agent_response" || input.type === "agent_response_correction") {
            if (turn.status === "completed") {
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
                ownerId,
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
              ownerId,
              avatarId: input.avatarId,
              turnId: turn.id,
              phases: ["speaking"],
              leaseAfter: now,
            });
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
              ownerId,
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
                ownerId,
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
              ownerId,
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
          db.groupVoiceSession.findFirst({ where: { id: sessionId, ownerId } }),
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
        const session = await tx.groupVoiceSession.findFirst({ where: { id: sessionId, ownerId } });
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
            ownerId,
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
            ownerId,
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
        where: { id: sessionId, ownerId, status: { in: ["connecting", "active"] } },
        data: { lastHeartbeatAt: new Date() },
      });
    },

    async markSessionActive(sessionId: string) {
      const activated = await db.groupVoiceSession.updateMany({
        where: { id: sessionId, status: "connecting", participants: { some: { status: "active" } } },
        data: { status: "active" },
      });
      return activated.count === 1;
    },

    async endSession(ownerId: string, sessionId: string, status: "ended" | "errored" = "ended") {
      return db.$transaction(async (tx) => {
        await lockGroupVoiceSessions(tx, [sessionId]);
        const session = await tx.groupVoiceSession.findFirst({
          where: { id: sessionId, ownerId },
          include: { participants: { include: { realtimeSession: true } } },
        });
        if (!session) throw new NotFoundError("Llamada grupal no encontrada");
        const endedAt = new Date();
        for (const participant of session.participants) {
          if (!participant.realtimeSession) continue;
          await enqueueSessionCleanup(tx, {
            realtimeSessionId: participant.realtimeSession.id,
            providerSessionTokenCiphertext: participant.realtimeSession.providerSessionTokenCiphertext,
            ownerId,
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
      return db.groupVoiceSession.findMany({
        where: {
          status: { in: ["connecting", "active"] },
          expiresAt: { lte: now },
        },
        include: { participants: { include: { realtimeSession: true } } },
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
          ownerId: session.ownerId,
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

type FloorPhase = "queued" | "speaking" | "committing";

function isFloorPhase(phase: string): phase is FloorPhase {
  return phase === "queued" || phase === "speaking" || phase === "committing";
}

async function cancelRoundTransaction(
  tx: Prisma.TransactionClient,
  sessionId: string,
  roundId: string,
  expected: {
    ownerId: string;
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
      ownerId: expected.ownerId,
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
      sourceEventId: `group-turn:${turn.id}`,
      metadata: { source: "elevenlabs_agent", instruction: turn.instructionText },
    },
    update: {
      content,
      speakerAvatarId: turn.avatarAgentId,
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

async function endGroupSessionsForDeletion(tx: Prisma.TransactionClient, ownerId: string, groupId: string) {
  const sessionIds = await tx.groupVoiceSession.findMany({
    where: { avatarGroupId: groupId, ownerId },
    select: { id: true },
  });
  await terminateGroupVoiceSessionsForDeletion(tx, {
    sessionIds: sessionIds.map((session) => session.id),
    errorMessage: "avatar_group_deleted",
  });
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
