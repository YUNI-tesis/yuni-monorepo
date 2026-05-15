import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@yuni.local" },
    update: { name: "Demo Creator" },
    create: {
      email: "demo@yuni.local",
      name: "Demo Creator",
    },
  });

  const avatar = await prisma.avatarAgent.upsert({
    where: { id: "demo-avatar-agent" },
    update: {
      ownerId: user.id,
      status: "active",
    },
    create: {
      id: "demo-avatar-agent",
      ownerId: user.id,
      name: "YUNI Demo",
      description: "Avatar de prueba",
      instructions: "Responde de forma clara y amable.",
      context: "Contexto inicial de prueba.",
      voiceConfig: { provider: "openai", voiceId: "alloy", speakingRate: 1 },
      liveAvatarConfig: { provider: "liveavatar", avatarId: "demo", mode: "lite", sandbox: true },
      status: "active",
    },
  });

  await prisma.shareLink.upsert({
    where: { slug: "demo" },
    update: {
      ownerId: user.id,
      avatarAgentId: avatar.id,
      name: "Demo public link",
      isEnabled: true,
    },
    create: {
      ownerId: user.id,
      avatarAgentId: avatar.id,
      slug: "demo",
      name: "Demo public link",
      isEnabled: true,
    },
  });
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
