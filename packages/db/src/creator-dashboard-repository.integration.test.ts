import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createAvatarActivityRepository } from "./repositories/avatar-activity-repository";
import { createAvatarGroupActivityRepository } from "./repositories/avatar-group-activity-repository";
import { createCreatorDashboardRepository } from "./repositories/creator-dashboard-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;

integration("creator dashboard repository integration", () => {
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("uses only objective, owned activity and resolves the latest voice attempt per conversation", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const owner = await db.user.create({
      data: {
        email: `dashboard-owner-${suffix}@integration.yuni.test`,
        passwordHash: "integration-only",
        name: "Dashboard owner",
      },
    });
    const foreignOwner = await db.user.create({
      data: {
        email: `dashboard-foreign-${suffix}@integration.yuni.test`,
        passwordHash: "integration-only",
        name: "Foreign owner",
      },
    });

    try {
      const [avatar, foreignAvatar] = await Promise.all([
        createAvatar(owner.id, `Dashboard avatar ${suffix}`),
        createAvatar(foreignOwner.id, `Foreign avatar ${suffix}`),
      ]);
      const [shareLink, foreignShareLink] = await Promise.all([
        db.shareLink.create({
          data: {
            ownerId: owner.id,
            avatarAgentId: avatar.id,
            slug: `dashboard-${suffix}`,
            name: "Dashboard integration",
          },
        }),
        db.shareLink.create({
          data: {
            ownerId: foreignOwner.id,
            avatarAgentId: foreignAvatar.id,
            slug: `dashboard-foreign-${suffix}`,
            name: "Foreign dashboard integration",
          },
        }),
      ]);
      const [directGrant, voiceGrant, recoveredGrant, interruptedGrant, publicOnlyGrant] = await Promise.all([
        createGrant(owner.id, avatar.id, `Person-${suffix}@Example.com`, "2026-07-01T10:00:00.000Z"),
        createGrant(owner.id, avatar.id, `voice-${suffix}@example.com`, "2026-07-01T10:00:00.000Z"),
        createGrant(owner.id, avatar.id, `recovered-${suffix}@example.com`, "2026-07-01T10:00:00.000Z"),
        createGrant(owner.id, avatar.id, `interrupted-${suffix}@example.com`, "2026-07-01T10:00:00.000Z"),
        createGrant(owner.id, avatar.id, `public-only-${suffix}@example.com`, "2026-07-01T10:00:00.000Z"),
      ]);

      const directConversation = await createConversation({
        avatarAgentId: avatar.id,
        accessGrantId: directGrant.id,
        participantEmail: ` person-${suffix}@example.com `,
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      });
      await db.message.create({
        data: {
          conversationId: directConversation.id,
          role: "user",
          content: "Actividad actual en una conversación antigua",
          createdAt: new Date("2026-08-10T13:00:00.000Z"),
        },
      });
      await db.message.createMany({
        data: [
          {
            conversationId: directConversation.id,
            role: "user",
            content: "Antes de medianoche local",
            createdAt: new Date("2026-08-15T02:30:00.000Z"),
          },
          {
            conversationId: directConversation.id,
            role: "user",
            content: "Después de medianoche local",
            createdAt: new Date("2026-08-15T03:30:00.000Z"),
          },
        ],
      });

      const publicOnlyConversation = await createConversation({
        avatarAgentId: avatar.id,
        visibility: "public",
        shareLinkId: shareLink.id,
        participantEmail: publicOnlyGrant.participantEmail,
        createdAt: new Date("2026-08-08T10:00:00.000Z"),
      });
      await db.message.create({
        data: {
          conversationId: publicOnlyConversation.id,
          role: "user",
          content: "Actividad pública sin uso directo del grant",
          createdAt: new Date("2026-08-08T13:00:00.000Z"),
        },
      });

      const publicConversation = await createConversation({
        avatarAgentId: avatar.id,
        visibility: "public",
        shareLinkId: shareLink.id,
        participantEmail: `PERSON-${suffix}@EXAMPLE.COM`,
        createdAt: new Date("2026-08-11T10:00:00.000Z"),
      });
      await db.message.create({
        data: {
          conversationId: publicConversation.id,
          role: "user",
          content: "La misma persona por link público",
          createdAt: new Date("2026-08-11T13:00:00.000Z"),
        },
      });

      const emptyDirectConversation = await createConversation({
        avatarAgentId: avatar.id,
        accessGrantId: directGrant.id,
        participantEmail: directGrant.participantEmail,
        createdAt: new Date("2026-08-12T10:00:00.000Z"),
      });

      const voiceConversation = await createConversation({
        avatarAgentId: avatar.id,
        accessGrantId: voiceGrant.id,
        participantEmail: voiceGrant.participantEmail,
        mode: "voice",
        createdAt: new Date("2026-08-12T10:00:00.000Z"),
      });
      await db.realtimeSession.create({
        data: {
          conversationId: voiceConversation.id,
          avatarAgentId: avatar.id,
          accessGrantId: voiceGrant.id,
          status: "ended",
          startedAt: new Date("2026-08-12T13:00:00.000Z"),
          activatedAt: new Date("2026-08-12T13:00:03.000Z"),
          endedAt: new Date("2026-08-12T13:04:03.000Z"),
        },
      });
      await db.realtimeSession.create({
        data: {
          conversationId: voiceConversation.id,
          avatarAgentId: avatar.id,
          accessGrantId: voiceGrant.id,
          status: "errored",
          startedAt: new Date("2026-08-13T13:00:00.000Z"),
          endedAt: new Date("2026-08-13T13:00:02.000Z"),
        },
      });
      await db.realtimeSession.create({
        data: {
          conversationId: voiceConversation.id,
          avatarAgentId: avatar.id,
          accessGrantId: voiceGrant.id,
          status: "ended",
          startedAt: new Date("2026-08-13T14:00:00.000Z"),
          activatedAt: new Date("2026-08-13T14:00:03.000Z"),
          endedAt: new Date("2026-08-13T14:02:03.000Z"),
        },
      });

      const recoveredFailedConversation = await createConversation({
        avatarAgentId: avatar.id,
        accessGrantId: recoveredGrant.id,
        participantEmail: recoveredGrant.participantEmail,
        mode: "voice",
        createdAt: new Date("2026-08-09T10:00:00.000Z"),
      });
      await db.realtimeSession.create({
        data: {
          conversationId: recoveredFailedConversation.id,
          avatarAgentId: avatar.id,
          accessGrantId: recoveredGrant.id,
          status: "errored",
          startedAt: new Date("2026-08-09T13:00:00.000Z"),
          endedAt: new Date("2026-08-09T13:00:02.000Z"),
        },
      });
      const recoveredConversation = await createConversation({
        avatarAgentId: avatar.id,
        accessGrantId: recoveredGrant.id,
        participantEmail: recoveredGrant.participantEmail,
        mode: "voice",
        createdAt: new Date("2026-08-09T13:30:00.000Z"),
      });
      await db.realtimeSession.create({
        data: {
          conversationId: recoveredConversation.id,
          avatarAgentId: avatar.id,
          accessGrantId: recoveredGrant.id,
          status: "ended",
          startedAt: new Date("2026-08-09T14:00:00.000Z"),
          activatedAt: new Date("2026-08-09T14:00:03.000Z"),
          endedAt: new Date("2026-08-09T14:03:03.000Z"),
        },
      });

      const interruptedConversation = await createConversation({
        avatarAgentId: avatar.id,
        accessGrantId: interruptedGrant.id,
        participantEmail: interruptedGrant.participantEmail,
        mode: "voice",
        createdAt: new Date("2026-08-14T10:00:00.000Z"),
      });
      const interrupted = await db.realtimeSession.create({
        data: {
          conversationId: interruptedConversation.id,
          avatarAgentId: avatar.id,
          accessGrantId: interruptedGrant.id,
          status: "errored",
          startedAt: new Date("2026-08-14T13:00:00.000Z"),
          endedAt: new Date("2026-08-14T13:00:02.000Z"),
        },
      });

      const ownerConversation = await createConversation({
        avatarAgentId: avatar.id,
        participantEmail: ` ${owner.email.toUpperCase()} `,
        visibility: "public",
        shareLinkId: shareLink.id,
        createdAt: new Date("2026-08-10T10:00:00.000Z"),
      });
      const foreignConversation = await createConversation({
        avatarAgentId: foreignAvatar.id,
        participantEmail: `foreign-participant-${suffix}@example.com`,
        visibility: "public",
        shareLinkId: foreignShareLink.id,
        createdAt: new Date("2026-08-10T10:00:00.000Z"),
      });
      await db.message.createMany({
        data: [ownerConversation, foreignConversation].map((conversation) => ({
          conversationId: conversation.id,
          role: "user" as const,
          content: "No debe entrar",
          createdAt: new Date("2026-08-10T13:00:00.000Z"),
        })),
      });
      const mismatchedForeignVoiceSession = await db.realtimeSession.create({
        data: {
          conversationId: foreignConversation.id,
          avatarAgentId: avatar.id,
          status: "ended",
          startedAt: new Date("2026-08-10T14:00:00.000Z"),
          activatedAt: new Date("2026-08-10T14:00:03.000Z"),
          endedAt: new Date("2026-08-10T14:01:03.000Z"),
        },
      });

      const result = await createCreatorDashboardRepository(db).getSummaryData(owner.id, {
        activityFrom: new Date("2026-08-01T00:00:00.000Z"),
        activityTo: new Date("2026-09-01T00:00:00.000Z"),
        cohortFrom: new Date("2026-06-01T00:00:00.000Z"),
        cohortTo: new Date("2026-09-01T00:00:00.000Z"),
        timeZone: "America/Argentina/Buenos_Aires",
      });

      expect(new Set(result.activityBuckets.map((row) => row.conversationId))).toEqual(
        new Set([
          directConversation.id,
          publicConversation.id,
          publicOnlyConversation.id,
          voiceConversation.id,
          recoveredConversation.id,
        ])
      );
      expect(
        new Set(
          result.activityBuckets
            .filter(
              (row) =>
                row.conversationId === directConversation.id || row.conversationId === publicConversation.id
            )
            .map((row) => row.participantEmail)
        )
      ).toEqual(new Set([`person-${suffix}@example.com`]));
      expect(result.activityBuckets.find((row) => row.conversationId === voiceConversation.id)).toMatchObject(
        {
          participantTurns: 0,
          mode: "voice",
        }
      );
      expect(result.voiceSessions).not.toContainEqual(
        expect.objectContaining({ id: mismatchedForeignVoiceSession.id })
      );

      const directActivity = result.grants.find((grant) => grant.id === directGrant.id);
      expect(directActivity?.firstDirectActivityAt?.toISOString()).toBe("2026-08-10T13:00:00.000Z");
      expect(directActivity?.latestParticipantActivityAt?.toISOString()).toBe("2026-08-15T03:30:00.000Z");
      expect(
        result.activityBuckets
          .filter((row) => row.conversationId === directConversation.id)
          .map((row) => row.activityDate)
      ).toEqual(["2026-08-10", "2026-08-14", "2026-08-15"]);
      expect(result.grants.find((grant) => grant.id === publicOnlyGrant.id)).toMatchObject({
        firstDirectActivityAt: null,
        latestParticipantActivityAt: new Date("2026-08-08T13:00:00.000Z"),
      });
      expect(
        new Set(result.interruptedConversations.map((conversation) => conversation.conversationId))
      ).toEqual(new Set([recoveredFailedConversation.id, interruptedConversation.id]));
      expect(result.interruptedConversations[0]?.totalCount).toBe(2);
      expect(result.interruptedConversations).toContainEqual(
        expect.objectContaining({ sessionId: interrupted.id, conversationId: interruptedConversation.id })
      );
      expect(result.interruptedConversations).not.toContainEqual(
        expect.objectContaining({ conversationId: recoveredConversation.id })
      );
      expect(result.interruptedConversations).toContainEqual(
        expect.objectContaining({ conversationId: recoveredFailedConversation.id })
      );
      expect(result.avatarLastActivity).toEqual([expect.objectContaining({ avatarAgentId: avatar.id })]);

      const activityRepository = createAvatarActivityRepository(db);
      const participants = await activityRepository.listParticipants(owner.id, avatar.id);
      const normalizedEmail = `person-${suffix}@example.com`;
      expect(participants.filter((participant) => participant.participantEmail === normalizedEmail)).toEqual([
        expect.objectContaining({
          participantEmail: normalizedEmail,
          origins: ["access_grant", "public_link"],
          totalConversations: 3,
        }),
      ]);

      const participantConversations = await activityRepository.listConversations(
        owner.id,
        avatar.id,
        normalizedEmail,
        { limit: 10 }
      );
      expect(new Set(participantConversations.conversations.map((conversation) => conversation.id))).toEqual(
        new Set([directConversation.id, publicConversation.id, emptyDirectConversation.id])
      );
    } finally {
      await db.user.deleteMany({ where: { id: { in: [foreignOwner.id, owner.id] } } });
    }
  });

  it("counts an activated group conversation once and excludes primary-avatar fan-out and pre-activation failures", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [owner, participant] = await Promise.all([
      db.user.create({
        data: {
          email: `group-dashboard-owner-${suffix}@integration.yuni.test`,
          passwordHash: "integration-only",
          name: "Group dashboard owner",
        },
      }),
      db.user.create({
        data: {
          email: `group-dashboard-participant-${suffix}@integration.yuni.test`,
          passwordHash: "integration-only",
          name: "Group participant",
        },
      }),
    ]);

    try {
      const [primaryAvatar, secondaryAvatar] = await Promise.all([
        createAvatar(owner.id, `Group primary ${suffix}`),
        createAvatar(owner.id, `Group secondary ${suffix}`),
      ]);
      const group = await db.avatarGroup.create({
        data: {
          ownerId: owner.id,
          name: `Consejo ${suffix}`,
          members: {
            create: [
              { avatarAgentId: primaryAvatar.id, position: 0 },
              { avatarAgentId: secondaryAvatar.id, position: 1 },
            ],
          },
        },
      });
      const grant = await db.groupAccessGrant.create({
        data: {
          avatarGroupId: group.id,
          ownerId: owner.id,
          participantEmail: participant.email,
          participantUserId: participant.id,
          avatarGroupOwnerIdSnapshot: owner.id,
          avatarGroupNameSnapshot: group.name,
          groupMembershipVersion: 1,
        },
      });

      const createGroupConversation = async (
        id: string,
        status: "ended" | "errored",
        activatedAt: Date | null,
        endedAt: Date
      ) => {
        const conversation = await db.conversation.create({
          data: {
            id: `group-dashboard-${suffix}-${id}`,
            ownerId: participant.id,
            avatarAgentId: primaryAvatar.id,
            avatarGroupId: group.id,
            groupAccessGrantId: grant.id,
            participantEmail: participant.email,
            avatarGroupOwnerIdSnapshot: owner.id,
            avatarGroupNameSnapshot: group.name,
            groupMembershipVersion: 1,
            avatarGroupRosterSnapshot: [
              { id: primaryAvatar.id, name: primaryAvatar.name, position: 0 },
              { id: secondaryAvatar.id, name: secondaryAvatar.name, position: 1 },
            ],
            visibility: "private",
            mode: "voice",
            status: "ended",
            title: id,
            createdAt: new Date(endedAt.getTime() - 5 * 60_000),
          },
        });
        const session = await db.groupVoiceSession.create({
          data: {
            id: `${conversation.id}-session`,
            avatarGroupId: group.id,
            conversationId: conversation.id,
            ownerId: owner.id,
            initiatorUserId: participant.id,
            groupAccessGrantId: grant.id,
            status,
            expiresAt: new Date(endedAt.getTime() + 60_000),
            startedAt: new Date(endedAt.getTime() - 5 * 60_000),
            activatedAt,
            endedAt,
            errorMessage: status === "errored" ? "integration failure" : null,
          },
        });
        await db.message.create({
          data: {
            conversationId: conversation.id,
            role: "user",
            content: `Mensaje ${id}`,
            createdAt: new Date(endedAt.getTime() - 4 * 60_000),
          },
        });
        return { conversation, session };
      };

      const activated = await createGroupConversation(
        "activated",
        "ended",
        new Date("2026-08-10T10:00:05.000Z"),
        new Date("2026-08-10T10:05:05.000Z")
      );
      const preActivationFailure = await createGroupConversation(
        "pre-activation",
        "errored",
        null,
        new Date("2026-08-11T10:00:05.000Z")
      );
      const activatedFailure = await createGroupConversation(
        "activated-error",
        "errored",
        new Date("2026-08-12T10:00:05.000Z"),
        new Date("2026-08-12T10:01:05.000Z")
      );

      const result = await createCreatorDashboardRepository(db).getSummaryData(owner.id, {
        activityFrom: new Date("2026-08-01T00:00:00.000Z"),
        activityTo: new Date("2026-09-01T00:00:00.000Z"),
        cohortFrom: new Date("2026-07-01T00:00:00.000Z"),
        cohortTo: new Date("2026-09-01T00:00:00.000Z"),
        timeZone: "UTC",
        includeGroupAnalytics: true,
      });

      expect(result.activityBuckets).not.toContainEqual(
        expect.objectContaining({ conversationId: activated.conversation.id })
      );
      expect(new Set(result.groupActivityBuckets.map((row) => row.conversationId))).toEqual(
        new Set([activated.conversation.id, activatedFailure.conversation.id])
      );
      expect(result.groupActivityBuckets).not.toContainEqual(
        expect.objectContaining({ conversationId: preActivationFailure.conversation.id })
      );
      expect(result.groupVoiceSessions.map((session) => session.id)).toEqual(
        expect.arrayContaining([activated.session.id, activatedFailure.session.id])
      );
      expect(result.groupVoiceSessions).not.toContainEqual(
        expect.objectContaining({ id: preActivationFailure.session.id })
      );
      expect(result.interruptedGroupConversations).toEqual([
        expect.objectContaining({ conversationId: activatedFailure.conversation.id, totalCount: 1 }),
      ]);

      const primaryAvatarActivity = await createAvatarActivityRepository(db).listParticipants(
        owner.id,
        primaryAvatar.id
      );
      expect(primaryAvatarActivity).not.toContainEqual(
        expect.objectContaining({ participantEmail: participant.email })
      );

      const groupActivity = createAvatarGroupActivityRepository(db);
      const participants = await groupActivity.listParticipants(owner.id, group.id);
      expect(participants.participants).toEqual([
        expect.objectContaining({ participantEmail: participant.email, totalConversations: 2 }),
      ]);
      const conversations = await groupActivity.listConversations(owner.id, group.id, participant.email, {
        limit: 10,
      });
      expect(new Set(conversations.conversations.map((conversation) => conversation.id))).toEqual(
        new Set([activated.conversation.id, activatedFailure.conversation.id])
      );
    } finally {
      await db.user.deleteMany({ where: { id: { in: [participant.id, owner.id] } } });
    }
  });

  it("keeps the aggregate query below the initial 500 ms p95 target with representative volume", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const owner = await db.user.create({
      data: {
        email: `dashboard-volume-${suffix}@integration.yuni.test`,
        passwordHash: "integration-only",
        name: "Dashboard volume owner",
      },
    });

    try {
      const avatar = await createAvatar(owner.id, `Volume avatar ${suffix}`);
      const grant = await createGrant(
        owner.id,
        avatar.id,
        `volume-participant-${suffix}@example.com`,
        "2026-07-01T10:00:00.000Z"
      );
      const conversationIds = Array.from(
        { length: 250 },
        (_, index) => `dashboard-volume-${suffix}-${index}`
      );
      await db.conversation.createMany({
        data: conversationIds.map((id, index) => ({
          id,
          avatarAgentId: avatar.id,
          accessGrantId: grant.id,
          participantEmail: grant.participantEmail,
          visibility: "private" as const,
          mode: index < 50 ? ("voice" as const) : ("text" as const),
          createdAt: new Date(`2026-08-${String((index % 20) + 1).padStart(2, "0")}T10:00:00.000Z`),
        })),
      });
      await db.message.createMany({
        data: conversationIds.flatMap((conversationId, conversationIndex) =>
          Array.from({ length: 20 }, (_, messageIndex) => ({
            conversationId,
            role: messageIndex % 2 === 0 ? ("user" as const) : ("assistant" as const),
            content: `Volume message ${messageIndex}`,
            createdAt: new Date(
              `2026-08-${String((conversationIndex % 20) + 1).padStart(2, "0")}T${String(
                10 + (messageIndex % 10)
              ).padStart(2, "0")}:00:00.000Z`
            ),
          }))
        ),
      });
      await db.realtimeSession.createMany({
        data: conversationIds.slice(0, 50).map((conversationId, index) => ({
          conversationId,
          avatarAgentId: avatar.id,
          accessGrantId: grant.id,
          status: "ended" as const,
          startedAt: new Date(`2026-08-${String((index % 20) + 1).padStart(2, "0")}T12:00:00.000Z`),
          activatedAt: new Date(`2026-08-${String((index % 20) + 1).padStart(2, "0")}T12:00:03.000Z`),
          endedAt: new Date(`2026-08-${String((index % 20) + 1).padStart(2, "0")}T12:04:03.000Z`),
        })),
      });

      const repository = createCreatorDashboardRepository(db);
      const query = {
        activityFrom: new Date("2026-08-01T00:00:00.000Z"),
        activityTo: new Date("2026-09-01T00:00:00.000Z"),
        cohortFrom: new Date("2026-06-01T00:00:00.000Z"),
        cohortTo: new Date("2026-09-01T00:00:00.000Z"),
        timeZone: "UTC",
      };
      await repository.getSummaryData(owner.id, query);
      const durations: number[] = [];
      for (let run = 0; run < 20; run += 1) {
        const startedAt = performance.now();
        const result = await repository.getSummaryData(owner.id, query);
        durations.push(performance.now() - startedAt);
        expect(result.activityBuckets).toHaveLength(250);
      }
      const p95 =
        [...durations].sort((left, right) => left - right)[Math.ceil(durations.length * 0.95) - 1] ??
        Number.POSITIVE_INFINITY;
      expect(p95, `dashboard repository p95 was ${p95.toFixed(1)} ms`).toBeLessThan(500);
    } finally {
      await db.user.delete({ where: { id: owner.id } });
    }
  }, 30_000);

  function createAvatar(ownerId: string, name: string) {
    return db!.avatarAgent.create({
      data: {
        ownerId,
        name,
        description: "Integration avatar",
        instructions: "Respondé breve.",
        context: "Contexto",
        voiceConfig: { provider: "elevenlabs", voiceId: `voice-${name}` },
        liveAvatarConfig: { provider: "liveavatar", avatarId: `live-${name}`, mode: "lite", sandbox: true },
        status: "active",
      },
    });
  }

  function createGrant(ownerId: string, avatarAgentId: string, participantEmail: string, createdAt: string) {
    return db!.accessGrant.create({
      data: { ownerId, avatarAgentId, participantEmail, createdAt: new Date(createdAt) },
    });
  }

  function createConversation(input: {
    avatarAgentId: string;
    participantEmail: string;
    accessGrantId?: string;
    visibility?: "private" | "public";
    shareLinkId?: string;
    mode?: "text" | "voice";
    createdAt: Date;
  }) {
    return db!.conversation.create({
      data: {
        avatarAgentId: input.avatarAgentId,
        participantEmail: input.participantEmail,
        accessGrantId: input.accessGrantId ?? null,
        shareLinkId: input.shareLinkId ?? null,
        visibility: input.visibility ?? "private",
        mode: input.mode ?? "text",
        createdAt: input.createdAt,
      },
    });
  }
});
