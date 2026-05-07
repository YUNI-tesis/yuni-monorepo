import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const LIVEAVATAR_SANDBOX_AVATAR_ID = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

async function main() {
  const email = process.env.SEED_USER_EMAIL || "demo@yuni.local";
  const password = process.env.SEED_USER_PASSWORD || "password123";
  const name = process.env.SEED_USER_NAME || "Yuni Demo";

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: hashedPassword,
    },
    create: {
      email,
      name,
      password: hashedPassword,
    },
  });

  const existingAgent = await prisma.agent.findFirst({
    where: {
      userId: user.id,
      name: "LiveAvatar Sandbox Agent",
    },
  });

  if (!existingAgent) {
    await prisma.agent.create({
      data: {
        userId: user.id,
        name: "LiveAvatar Sandbox Agent",
        description: "Agente demo para probar llamadas en vivo con LiveAvatar sandbox.",
        systemPrompt:
          "Eres un agente demo de Yuni AI. Responde de forma breve, clara y útil durante una llamada en vivo.",
        context:
          "Este agente existe para validar la integración de Yuni AI con LiveAvatar en modo LITE usando el avatar sandbox Wayne.",
        toolsAllowed: ["none"],
        voice: {
          provider: "openai",
          voiceId: "alloy",
          speakingRate: 1,
        },
        avatar: {
          provider: "liveavatar",
          externalAvatarId: LIVEAVATAR_SANDBOX_AVATAR_ID,
          displayName: "Wayne Sandbox",
          quality: "high",
          fallbackModelPath: "/assets/pennywise-rigged.glb",
        },
      },
    });
  }

  console.log(`Seed completed. User: ${email} / ${password}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
