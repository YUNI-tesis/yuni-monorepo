import { PrismaClient } from "@prisma/client";
import { serverEnv } from "@yuni/config";

const globalForPrisma = globalThis as unknown as {
  yuniPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.yuniPrisma ?? new PrismaClient();

if (serverEnv.NODE_ENV !== "production") {
  globalForPrisma.yuniPrisma = prisma;
}

export type PrismaClientInstance = typeof prisma;
