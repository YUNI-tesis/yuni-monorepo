import { PrismaClient } from "@prisma/client";
import { DASHBOARD_SEED_PREFIX } from "./dashboard-seed-namespace";

const prisma = new PrismaClient();
const includeLegacy = process.argv.includes("--include-legacy");

async function removeNamespacedSeed() {
  return prisma.$transaction(async (tx) => {
    const messages = await tx.message.deleteMany({
      where: { id: { startsWith: `${DASHBOARD_SEED_PREFIX}-` } },
    });
    const realtimeSessions = await tx.realtimeSession.deleteMany({
      where: { id: { startsWith: `${DASHBOARD_SEED_PREFIX}-` } },
    });
    const conversations = await tx.conversation.deleteMany({
      where: { id: { startsWith: `${DASHBOARD_SEED_PREFIX}-` } },
    });
    const publicSessions = await tx.publicSession.deleteMany({
      where: { id: { startsWith: `${DASHBOARD_SEED_PREFIX}-` } },
    });
    const accessGrants = await tx.accessGrant.deleteMany({
      where: { id: { startsWith: `${DASHBOARD_SEED_PREFIX}-` } },
    });
    const shareLinks = await tx.shareLink.deleteMany({
      where: { id: { startsWith: `${DASHBOARD_SEED_PREFIX}-` } },
    });
    const avatarAgents = await tx.avatarAgent.deleteMany({
      where: { id: { startsWith: `${DASHBOARD_SEED_PREFIX}-` } },
    });
    const users = await tx.user.deleteMany({
      where: { id: { startsWith: `${DASHBOARD_SEED_PREFIX}-` } },
    });

    return {
      messages: messages.count,
      realtimeSessions: realtimeSessions.count,
      conversations: conversations.count,
      publicSessions: publicSessions.count,
      accessGrants: accessGrants.count,
      shareLinks: shareLinks.count,
      avatarAgents: avatarAgents.count,
      users: users.count,
    };
  });
}

async function removeLegacyDashboardSeed() {
  const legacyParticipantDomain = "@estudiantes.yuni.demo";
  const legacyAvatarIds = ["demo-avatar-agent", "demo-avatar-thesis", "demo-avatar-presentations"];

  return prisma.$transaction(async (tx) => {
    const realtimeSessions = await tx.realtimeSession.deleteMany({
      where: { id: { startsWith: "demo-dashboard-" } },
    });
    const conversations = await tx.conversation.deleteMany({
      where: { id: { startsWith: "demo-dashboard-" } },
    });
    const publicSessions = await tx.publicSession.deleteMany({
      where: { id: { startsWith: "demo-dashboard-" } },
    });
    const accessGrants = await tx.accessGrant.deleteMany({
      where: {
        avatarAgentId: { in: legacyAvatarIds },
        participantEmail: { endsWith: legacyParticipantDomain },
      },
    });
    const shareLinks = await tx.shareLink.deleteMany({
      where: {
        OR: [{ id: "demo-share-thesis" }, { slug: "demo-tesis" }],
      },
    });
    const avatarAgents = await tx.avatarAgent.deleteMany({
      where: { id: { in: ["demo-avatar-thesis", "demo-avatar-presentations"] } },
    });
    const users = await tx.user.deleteMany({
      where: { email: { endsWith: legacyParticipantDomain } },
    });

    const demoOwner = await tx.user.findUnique({ where: { email: "demo@yuni.local" } });
    if (demoOwner) {
      await tx.avatarAgent.updateMany({
        where: { id: "demo-avatar-agent", ownerId: demoOwner.id },
        data: {
          name: "YUNI Demo",
          description: "Avatar de prueba",
          instructions: "Responde de forma clara y amable.",
          context: "Contexto inicial de prueba.",
          voiceConfig: { provider: "openai", voiceId: "alloy", speakingRate: 1 },
          liveAvatarConfig: {
            provider: "liveavatar",
            avatarId: "demo",
            mode: "lite",
            sandbox: true,
          },
          agentProvider: "elevenlabs_agents",
          providerAgentId: null,
          providerSyncStatus: "not_synced",
          providerSyncError: null,
          providerSyncedAt: null,
          providerSyncFingerprint: null,
          providerLastUsableAt: null,
          providerContextDocumentId: null,
          providerContextSyncStatus: "pending",
          providerContextFingerprint: null,
          providerContextError: null,
          providerContextSyncedAt: null,
          providerContextLastUsableAt: null,
          status: "active",
        },
      });
      await tx.shareLink.updateMany({
        where: { slug: "demo", avatarAgentId: "demo-avatar-agent" },
        data: {
          ownerId: demoOwner.id,
          name: "Demo public link",
          isEnabled: true,
          lastUsedAt: null,
        },
      });
    }

    return {
      realtimeSessions: realtimeSessions.count,
      conversations: conversations.count,
      publicSessions: publicSessions.count,
      accessGrants: accessGrants.count,
      shareLinks: shareLinks.count,
      avatarAgents: avatarAgents.count,
      users: users.count,
    };
  });
}

async function main() {
  const removed = await removeNamespacedSeed();
  const legacyRemoved = includeLegacy ? await removeLegacyDashboardSeed() : null;

  console.info("Dashboard seed cleanup complete.", { removed, legacyRemoved });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
