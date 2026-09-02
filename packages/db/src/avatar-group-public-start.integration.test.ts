import { PrismaClient } from "@prisma/client";
import { groupConsentScopeId } from "@yuni/domain";
import { afterAll, describe, expect, it } from "vitest";
import { createAvatarGroupRepository } from "./repositories/avatar-group-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;

integration("public group session reservation integration", () => {
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("reserves the complete public roster with one public principal and immutable snapshots", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const owner = await db.user.create({
      data: {
        email: `public-group-owner-${suffix}@integration.yuni.test`,
        passwordHash: "integration-only",
        name: "Public group owner",
      },
    });
    let publicSessionId: string | undefined;
    let conversationId: string | undefined;

    try {
      const avatars = await Promise.all(
        Array.from({ length: 2 }, (_, position) =>
          db.avatarAgent.create({
            data: {
              ownerId: owner.id,
              name: `Public avatar ${position + 1}`,
              description: `Public avatar description ${position + 1}`,
              instructions: "Respondé de forma breve.",
              context: "Contexto de integración",
              voiceConfig: { provider: "elevenlabs", voiceId: `voice-${suffix}-${position}` },
              liveAvatarConfig: {
                provider: "liveavatar",
                avatarId: `live-${suffix}-${position}`,
                mode: "lite",
                sandbox: true,
                thumbnailUrl: `https://example.test/avatar-${position + 1}.png`,
              },
              status: "active",
              groupProviderAgentId: `group-provider-${suffix}-${position}`,
              groupProviderSyncStatus: "synced",
              groupProviderSyncedAt: new Date(),
            },
          })
        )
      );
      const group = await db.avatarGroup.create({
        data: {
          ownerId: owner.id,
          name: `Public group ${suffix}`,
          members: {
            create: avatars.map((avatar, position) => ({ avatarAgentId: avatar.id, position })),
          },
        },
      });
      const link = await db.groupShareLink.create({
        data: {
          avatarGroupId: group.id,
          ownerId: owner.id,
          slug: `public-group-${suffix}`,
          name: `Public group ${suffix}`,
          avatarGroupOwnerIdSnapshot: owner.id,
          avatarGroupNameSnapshot: group.name,
          groupMembershipVersion: group.membershipVersion,
        },
      });

      const result = await createAvatarGroupRepository(db).createPublicVoiceSession({
        shareLinkId: link.id,
        participantEmail: "  Public-Participant@Example.COM ",
        consentedAt: new Date(),
        consentScopeId: groupConsentScopeId("share-link", link.id),
        consentVersion: group.membershipVersion,
        capacity: { maxConcurrentPerParticipant: 2, maxConcurrentPerAvatar: 2 },
      });
      publicSessionId = result.publicSession.id;
      conversationId = result.voiceSession.conversationId;

      const conversation = await db.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: {
          conversationAvatars: { orderBy: { position: "asc" } },
          groupParticipantSnapshots: { orderBy: { position: "asc" } },
        },
      });

      expect(result.publicSession).toMatchObject({
        participantEmail: "public-participant@example.com",
        avatarGroupId: group.id,
        groupShareLinkId: link.id,
        status: "active",
      });
      expect(result.voiceSession).toMatchObject({
        avatarGroupId: group.id,
        ownerId: owner.id,
        initiatorUserId: null,
        groupAccessGrantId: null,
        groupPublicSessionId: result.publicSession.id,
        status: "connecting",
      });
      expect(result.voiceSession.participants.map(({ avatarAgentId }) => avatarAgentId)).toEqual(
        avatars.map(({ id }) => id)
      );
      expect(conversation).toMatchObject({
        visibility: "public",
        groupMembershipVersion: group.membershipVersion,
        participantEmail: "public-participant@example.com",
      });
      expect(conversation.conversationAvatars.map(({ avatarAgentId }) => avatarAgentId)).toEqual(
        avatars.map(({ id }) => id)
      );
      expect(
        conversation.groupParticipantSnapshots.map(({ sourceAvatarId, name, position }) => ({
          sourceAvatarId,
          name,
          position,
        }))
      ).toEqual(
        avatars.map((avatar, position) => ({
          sourceAvatarId: avatar.id,
          name: avatar.name,
          position,
        }))
      );
    } finally {
      if (conversationId) {
        await db.conversation.deleteMany({ where: { id: conversationId } });
      }
      if (publicSessionId) {
        await db.groupPublicSession.deleteMany({ where: { id: publicSessionId } });
      }
      await db.user.delete({ where: { id: owner.id } });
    }
  });
});
