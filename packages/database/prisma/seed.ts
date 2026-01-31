import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seed...");

  // Check if there are any users
  const userCount = await prisma.user.count();
  
  if (userCount > 0) {
    console.log(`Database already has ${userCount} user(s). Skipping seed.`);
    return;
  }

  // Create a demo user (optional - comment out if not needed)
  const hashedPassword = await bcrypt.hash("Password123!", 10);
  
  const demoUser = await prisma.user.create({
    data: {
      email: "luckylovaglio@gmail.com",
      password: hashedPassword,
      name: "Lucas Lovaglio",
    },
  });

  console.log("Created demo user:", {
    email: demoUser.email,
    name: demoUser.name,
  });

  // Create a sample agent for the demo user (optional)
  const sampleAgent = await prisma.agent.create({
    data: {
      userId: demoUser.id,
      name: "Assistant Demo",
      description: "Un agente de demostración que responde preguntas generales",
      systemPrompt: "Eres un asistente útil y amigable. Responde de manera clara y concisa.",
      context: "Puedes ayudar con preguntas generales, explicaciones y conversaciones casuales.",
      toolsAllowed: ["none"],
    },
  });

  console.log("Created sample agent:", {
    name: sampleAgent.name,
    description: sampleAgent.description,
  });

  console.log("\n✅ Database seed completed successfully!");
  console.log("\nDemo credentials:");
  console.log("  Email: demo@yuni.ai");
  console.log("  Password: demo123456");
}

main()
  .catch((e) => {
    console.error("Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
