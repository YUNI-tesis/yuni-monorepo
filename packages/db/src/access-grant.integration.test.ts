import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createAccessGrantRepository } from "./repositories/access-grant-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;

integration("access grant repository integration", () => {
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("revokes a grant referenced only by group membership and its conversation snapshot", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [owner, participant] = await Promise.all([
      db.user.create({
        data: {
          email: `grant-owner-${suffix}@integration.yuni.test`,
          passwordHash: "integration-only",
          name: "Grant owner",
        },
      }),
      db.user.create({
        data: {
          email: `grant-participant-${suffix}@integration.yuni.test`,
          passwordHash: "integration-only",
          name: "Grant participant",
        },
      }),
    ]);

    try {
      const avatar = await db.avatarAgent.create({
        data: {
          ownerId: owner.id,
          name: "Shared avatar",
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
      const grant = await db.accessGrant.create({
        data: {
          avatarAgentId: avatar.id,
          ownerId: owner.id,
          participantEmail: participant.email,
          participantUserId: participant.id,
        },
      });
      const group = await db.avatarGroup.create({
        data: {
          ownerId: participant.id,
          name: "Shared group",
          members: {
            create: {
              avatarAgentId: avatar.id,
              accessGrantId: grant.id,
              position: 0,
            },
          },
        },
      });
      const conversation = await db.conversation.create({
        data: {
          ownerId: participant.id,
          avatarAgentId: avatar.id,
          avatarGroupId: group.id,
          visibility: "private",
          mode: "voice",
          conversationAvatars: {
            create: {
              avatarAgentId: avatar.id,
              accessGrantId: grant.id,
              position: 0,
            },
          },
        },
      });

      const result = await createAccessGrantRepository(db).deleteForAvatar(owner.id, avatar.id, grant.id);
      const [persisted, member, snapshot] = await Promise.all([
        db.accessGrant.findUnique({ where: { id: grant.id } }),
        db.avatarGroupMember.findFirst({ where: { avatarGroupId: group.id } }),
        db.conversationAvatar.findFirst({ where: { conversationId: conversation.id } }),
      ]);

      expect(result.outcome).toBe("revoked");
      expect(persisted).toMatchObject({ id: grant.id, status: "revoked" });
      expect(persisted?.revokedAt).toBeInstanceOf(Date);
      expect(member?.accessGrantId).toBe(grant.id);
      expect(snapshot?.accessGrantId).toBe(grant.id);
      await expect(db.conversation.count({ where: { accessGrantId: grant.id } })).resolves.toBe(0);
    } finally {
      await db.user.deleteMany({ where: { id: { in: [participant.id, owner.id] } } });
    }
  });
});
