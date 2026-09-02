import { createAvatarGroupActivityRepository, type PrismaClientInstance } from "@yuni/db";

export type AvatarGroupActivityRepository = ReturnType<typeof createAvatarGroupActivityRepository>;

export function createAvatarGroupActivityDataRepository(
  prisma: PrismaClientInstance
): AvatarGroupActivityRepository {
  return createAvatarGroupActivityRepository(prisma);
}
