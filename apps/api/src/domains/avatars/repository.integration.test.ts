import { PrismaClient } from "@prisma/client";
import { createAvatarGroupRepository } from "@yuni/db";
import { afterAll, describe, expect, it } from "vitest";
import { createAvatarsRepository } from "./repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;

integration("avatar deletion repository integration", () => {
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("enqueues cleanup for an ended realtime attempt that had no prior outbox job", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await db.user.create({
      data: {
        email: `avatar-delete-${suffix}@integration.yuni.test`,
        passwordHash: "integration-only",
        name: "Avatar deletion",
      },
    });
    let createdJobIds: string[] = [];
    try {
      const avatar = await db.avatarAgent.create({
        data: {
          ownerId: user.id,
          name: "Avatar to delete",
          description: "Integration avatar",
          instructions: "Respondé breve.",
          context: "Contexto",
          voiceConfig: { provider: "elevenlabs", voiceId: `voice-${suffix}` },
          liveAvatarConfig: {
            provider: "liveavatar",
            avatarId: `live-${suffix}`,
            mode: "lite",
            sandbox: true,
          },
          status: "active",
        },
      });
      const realtime = await db.realtimeSession.create({
        data: {
          avatarAgentId: avatar.id,
          status: "ended",
          endedAt: new Date(),
          providerSessionId: `provider-${suffix}`,
          providerSessionTokenCiphertext: `ciphertext-${suffix}`,
        },
      });

      await createAvatarsRepository(db).deleteWithCleanup!(user.id, avatar.id);
      const jobs = await db.job.findMany({
        where: {
          OR: [
            { dedupeKey: `liveavatar-session-cleanup:${realtime.id}` },
            { dedupeKey: `avatar-cleanup:${avatar.id}` },
          ],
        },
      });
      createdJobIds = jobs.map((job) => job.id);
      const sessionCleanup = jobs.find(
        (job) => job.dedupeKey === `liveavatar-session-cleanup:${realtime.id}`
      );

      expect(sessionCleanup?.payload).toMatchObject({
        realtimeSessionId: realtime.id,
        providerSessionTokenCiphertext: `ciphertext-${suffix}`,
      });
      await expect(db.realtimeSession.findUnique({ where: { id: realtime.id } })).resolves.toBeNull();
    } finally {
      if (createdJobIds.length > 0) {
        await db.job.deleteMany({ where: { id: { in: createdJobIds } } });
      }
      await db.user.deleteMany({ where: { id: user.id } });
    }
  });

  it.each([
    ["primary", 0],
    ["non-primary", 1],
  ] as const)("preserves group history when deleting a %s avatar", async (_kind, deleteIndex) => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `${deleteIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await db.user.create({
      data: {
        email: `avatar-history-${suffix}@integration.yuni.test`,
        passwordHash: "integration-only",
        name: "Avatar history",
      },
    });
    let createdJobIds: string[] = [];
    try {
      const avatars = await Promise.all(
        Array.from({ length: 3 }, (_, index) => createTestAvatar(user.id, suffix, index))
      );
      const groupRepository = createAvatarGroupRepository(db);
      const group = await groupRepository.create(user.id, {
        name: `History group ${suffix}`,
        avatarIds: avatars.map((avatar) => avatar.id),
      });
      const session = await groupRepository.createVoiceSession(user.id, group.id);
      const deletedAvatar = avatars[deleteIndex]!;
      await db.message.createMany({
        data: [
          {
            conversationId: session.conversationId,
            role: "user",
            content: "Pregunta que debe conservarse",
            sourceEventId: `history-user-${suffix}`,
          },
          {
            conversationId: session.conversationId,
            role: "assistant",
            content: "Respuesta que debe conservarse",
            speakerAvatarId: deletedAvatar.id,
            sourceEventId: `history-assistant-${suffix}`,
          },
        ],
      });

      await createAvatarsRepository(db).deleteWithCleanup!(user.id, deletedAvatar.id);
      const [conversation, remainingMembers, cleanupJobs] = await Promise.all([
        db.conversation.findUnique({
          where: { id: session.conversationId },
          include: {
            messages: { orderBy: { createdAt: "asc" } },
            conversationAvatars: { orderBy: { position: "asc" } },
          },
        }),
        db.avatarGroupMember.findMany({
          where: { avatarGroupId: group.id },
          orderBy: { position: "asc" },
        }),
        db.job.findMany({ where: { dedupeKey: `avatar-cleanup:${deletedAvatar.id}` } }),
      ]);
      createdJobIds = cleanupJobs.map((job) => job.id);
      const expectedRemaining = avatars.filter((_, index) => index !== deleteIndex);

      expect(conversation?.avatarAgentId).toBe(deleteIndex === 0 ? expectedRemaining[0]!.id : avatars[0]!.id);
      expect(conversation?.messages.map(({ content }) => content)).toEqual([
        "Pregunta que debe conservarse",
        "Respuesta que debe conservarse",
      ]);
      expect(conversation?.messages[1]?.speakerAvatarId).toBeNull();
      expect(conversation?.conversationAvatars.map(({ avatarAgentId }) => avatarAgentId)).toEqual(
        expectedRemaining.map((avatar) => avatar.id)
      );
      expect(remainingMembers.map(({ avatarAgentId, position }) => ({ avatarAgentId, position }))).toEqual(
        expectedRemaining.map((avatar, position) => ({ avatarAgentId: avatar.id, position }))
      );
    } finally {
      if (createdJobIds.length > 0) {
        await db.job.deleteMany({ where: { id: { in: createdJobIds } } });
      }
      await db.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("keeps an active group call running when two active participants remain", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `active-degrade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await db.user.create({
      data: {
        email: `avatar-active-degrade-${suffix}@integration.yuni.test`,
        passwordHash: "integration-only",
        name: "Avatar active degradation",
      },
    });
    try {
      const avatars = await Promise.all(
        Array.from({ length: 3 }, (_, index) => createTestAvatar(user.id, suffix, index))
      );
      const groupRepository = createAvatarGroupRepository(db);
      const group = await groupRepository.create(user.id, {
        name: `Active degradation ${suffix}`,
        avatarIds: avatars.map((avatar) => avatar.id),
      });
      const session = await groupRepository.createVoiceSession(user.id, group.id);
      const attempts = await activateParticipants(groupRepository, user.id, session, [0, 1, 2]);
      await expect(groupRepository.markSessionActive(session.id)).resolves.toBe(true);

      const deletedAvatar = avatars[2]!;
      const deletedAttemptId = attempts.get(deletedAvatar.id);
      if (!deletedAttemptId) throw new Error("Missing deleted avatar attempt");
      await createAvatarsRepository(db).deleteWithCleanup!(user.id, deletedAvatar.id);

      const [persistedSession, persistedGroup, conversation, failure, cleanupJob] = await Promise.all([
        db.groupVoiceSession.findUnique({
          where: { id: session.id },
          include: { participants: { orderBy: { createdAt: "asc" } } },
        }),
        db.avatarGroup.findUnique({
          where: { id: group.id },
          include: { members: { orderBy: { position: "asc" } } },
        }),
        db.conversation.findUnique({ where: { id: session.conversationId } }),
        db.groupVoiceParticipantFailureEvent.findFirst({
          where: {
            groupVoiceSessionId: session.id,
            sourceEventId: `avatar-deleted:${deletedAvatar.id}`,
          },
        }),
        db.job.findUnique({
          where: { dedupeKey: `liveavatar-session-cleanup:${deletedAttemptId}` },
        }),
      ]);

      expect(persistedSession).toMatchObject({
        status: "active",
        endedAt: null,
        orchestrationPhase: "listening",
      });
      expect(persistedSession?.participants).toHaveLength(2);
      expect(persistedSession?.participants.every((participant) => participant.status === "active")).toBe(
        true
      );
      expect(persistedGroup?.deletedAt).toBeNull();
      expect(persistedGroup?.membershipVersion).toBe(group.membershipVersion + 1);
      expect(persistedGroup?.members.map((member) => member.avatarAgentId)).toEqual(
        avatars.slice(0, 2).map((avatar) => avatar.id)
      );
      expect(conversation?.status).toBe("active");
      expect(failure).toMatchObject({ avatarAgentId: deletedAvatar.id, reason: "avatar_deleted" });
      expect(cleanupJob).not.toBeNull();
    } finally {
      await db.job.deleteMany({ where: { ownerId: user.id } });
      await db.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("ends an active group call when deleting an avatar leaves fewer than two active participants", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `active-insufficient-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await db.user.create({
      data: {
        email: `avatar-active-insufficient-${suffix}@integration.yuni.test`,
        passwordHash: "integration-only",
        name: "Avatar active termination",
      },
    });
    try {
      const avatars = await Promise.all(
        Array.from({ length: 3 }, (_, index) => createTestAvatar(user.id, suffix, index))
      );
      const groupRepository = createAvatarGroupRepository(db);
      const group = await groupRepository.create(user.id, {
        name: `Active termination ${suffix}`,
        avatarIds: avatars.map((avatar) => avatar.id),
      });
      const session = await groupRepository.createVoiceSession(user.id, group.id);
      await activateParticipants(groupRepository, user.id, session, [0, 1]);
      await expect(groupRepository.markSessionActive(session.id)).resolves.toBe(true);

      await createAvatarsRepository(db).deleteWithCleanup!(user.id, avatars[0]!.id);

      const [persistedSession, persistedGroup, conversation] = await Promise.all([
        db.groupVoiceSession.findUnique({
          where: { id: session.id },
          include: { participants: { orderBy: { createdAt: "asc" } } },
        }),
        db.avatarGroup.findUnique({ where: { id: group.id } }),
        db.conversation.findUnique({ where: { id: session.conversationId } }),
      ]);

      expect(persistedSession).toMatchObject({
        status: "ended",
        orchestrationPhase: "ended",
        errorMessage: "avatar_deleted",
      });
      expect(persistedSession?.endedAt).not.toBeNull();
      expect(
        persistedSession?.participants.every(
          (participant) => participant.status === "ended" && participant.endedAt !== null
        )
      ).toBe(true);
      expect(persistedGroup?.deletedAt).toBeNull();
      expect(conversation?.status).toBe("ended");
    } finally {
      await db.job.deleteMany({ where: { ownerId: user.id } });
      await db.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("cleans every historical session before deleting a group whose current member is removed", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `group-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [user, sharedAvatarOwner] = await Promise.all([
      db.user.create({
        data: {
          email: `avatar-group-snapshot-${suffix}@integration.yuni.test`,
          passwordHash: "integration-only",
          name: "Avatar group snapshot",
        },
      }),
      db.user.create({
        data: {
          email: `shared-avatar-owner-${suffix}@integration.yuni.test`,
          passwordHash: "integration-only",
          name: "Shared avatar owner",
        },
      }),
    ]);
    let createdJobIds: string[] = [];
    try {
      const [avatarA, avatarB, avatarX] = await Promise.all([
        createTestAvatar(user.id, suffix, 0),
        createTestAvatar(user.id, suffix, 1),
        createTestAvatar(sharedAvatarOwner.id, suffix, 2),
      ]);
      await db.accessGrant.create({
        data: {
          avatarAgentId: avatarX.id,
          ownerId: sharedAvatarOwner.id,
          participantEmail: user.email,
          participantUserId: user.id,
          status: "active",
        },
      });
      const groupRepository = createAvatarGroupRepository(db);
      const group = await groupRepository.create(user.id, {
        name: `Snapshot group ${suffix}`,
        avatarIds: [avatarA.id, avatarB.id],
      });
      const session = await groupRepository.createVoiceSession(user.id, group.id);
      const attemptIds: string[] = [];
      for (const participant of session.participants) {
        const attempt = await groupRepository.createRealtimeParticipant(
          participant.id,
          session.conversationId,
          participant.avatarAgentId
        );
        const attemptId = attempt.realtimeSessionId;
        if (!attemptId) throw new Error("Expected a realtime participant attempt");
        attemptIds.push(attemptId);
        await groupRepository.activateParticipantConnection(
          participant.id,
          attemptId,
          `provider-${participant.avatarAgentId}`,
          `ciphertext-${participant.avatarAgentId}`
        );
      }
      await groupRepository.markSessionActive(session.id);
      await db.message.create({
        data: {
          conversationId: session.conversationId,
          role: "assistant",
          speakerAvatarId: avatarB.id,
          content: "Respuesta histórica de B",
          sourceEventId: `snapshot-history-${suffix}`,
        },
      });

      await groupRepository.update(user.id, group.id, { avatarIds: [avatarA.id, avatarX.id] });
      await createAvatarsRepository(db).deleteWithCleanup!(sharedAvatarOwner.id, avatarX.id);

      const [deletedGroup, deletedSession, conversation, attempts, cleanupJobs] = await Promise.all([
        db.avatarGroup.findUnique({ where: { id: group.id } }),
        db.groupVoiceSession.findUnique({ where: { id: session.id } }),
        db.conversation.findUnique({
          where: { id: session.conversationId },
          include: {
            conversationAvatars: { orderBy: { position: "asc" } },
            messages: { orderBy: { createdAt: "asc" } },
          },
        }),
        db.realtimeSession.findMany({ where: { id: { in: attemptIds } }, orderBy: { id: "asc" } }),
        db.job.findMany({
          where: {
            OR: [
              { dedupeKey: { in: attemptIds.map((id) => `liveavatar-session-cleanup:${id}`) } },
              { dedupeKey: `avatar-cleanup:${avatarX.id}` },
            ],
          },
        }),
      ]);
      createdJobIds = cleanupJobs.map((job) => job.id);

      expect(deletedGroup).toMatchObject({ id: group.id });
      expect(deletedGroup?.deletedAt).not.toBeNull();
      expect(deletedSession).toMatchObject({
        status: "ended",
        orchestrationPhase: "ended",
        errorMessage: "avatar_deleted",
      });
      expect(conversation).toMatchObject({
        avatarGroupId: group.id,
        status: "ended",
        avatarAgentId: avatarA.id,
      });
      expect(conversation?.conversationAvatars.map(({ avatarAgentId }) => avatarAgentId)).toEqual([
        avatarA.id,
        avatarB.id,
      ]);
      expect(
        conversation?.messages.map(({ content, speakerAvatarId }) => ({ content, speakerAvatarId }))
      ).toEqual([{ content: "Respuesta histórica de B", speakerAvatarId: avatarB.id }]);
      expect(attempts).toHaveLength(2);
      expect(attempts.every((attempt) => attempt.status === "ended" && attempt.endedAt !== null)).toBe(true);
      for (const attemptId of attemptIds) {
        const cleanup = cleanupJobs.find(
          (job) => job.dedupeKey === `liveavatar-session-cleanup:${attemptId}`
        );
        expect(cleanup?.payload).toMatchObject({
          realtimeSessionId: attemptId,
          providerSessionTokenCiphertext: expect.stringMatching(/^ciphertext-/),
        });
      }
    } finally {
      if (createdJobIds.length > 0) {
        await db.job.deleteMany({ where: { id: { in: createdJobIds } } });
      }
      await db.user.deleteMany({ where: { id: { in: [user.id, sharedAvatarOwner.id] } } });
    }
  });
});

type GroupRepository = ReturnType<typeof createAvatarGroupRepository>;
type GroupSession = Awaited<ReturnType<GroupRepository["createVoiceSession"]>>;

async function activateParticipants(
  repository: GroupRepository,
  ownerId: string,
  session: GroupSession,
  participantIndexes: number[]
) {
  const attempts = new Map<string, string>();
  for (const index of participantIndexes) {
    const participant = session.participants[index];
    if (!participant) throw new Error(`Missing participant at position ${index}`);
    const attempt = await repository.createRealtimeParticipant(
      participant.id,
      session.conversationId,
      participant.avatarAgentId
    );
    if (!attempt.realtimeSessionId) throw new Error("Expected a realtime participant attempt");
    attempts.set(participant.avatarAgentId, attempt.realtimeSessionId);
    await repository.activateParticipantConnection(
      participant.id,
      attempt.realtimeSessionId,
      `provider-${participant.avatarAgentId}`,
      `ciphertext-${participant.avatarAgentId}`
    );
    const confirmed = await repository.confirmParticipantStarted(
      ownerId,
      session.id,
      participant.avatarAgentId,
      attempt.realtimeSessionId
    );
    if (!confirmed) throw new Error("Expected participant start confirmation");
  }
  return attempts;
}

function createTestAvatar(dbOwnerId: string, suffix: string, index: number) {
  if (!db) throw new Error("TEST_DATABASE_URL is required");
  return db.avatarAgent.create({
    data: {
      ownerId: dbOwnerId,
      name: `Avatar ${index + 1}`,
      description: "Integration avatar",
      instructions: "Respondé breve.",
      context: "Contexto",
      voiceConfig: { provider: "elevenlabs", voiceId: `voice-${suffix}-${index}` },
      liveAvatarConfig: {
        provider: "liveavatar",
        avatarId: `live-${suffix}-${index}`,
        mode: "lite",
        sandbox: true,
      },
      status: "active",
    },
  });
}
