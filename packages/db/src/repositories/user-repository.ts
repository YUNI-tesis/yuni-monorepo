import type { PrismaClientInstance } from "../client";

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserWithPassword = PublicUser & {
  passwordHash: string;
};

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function createUserRepository(prisma: PrismaClientInstance) {
  return {
    createWithPassword(input: { email: string; passwordHash: string; name?: string }) {
      return prisma.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          ...(input.name ? { name: input.name } : {}),
        },
        select: publicUserSelect,
      });
    },

    findByEmail(email: string): Promise<UserWithPassword | null> {
      return prisma.user.findUnique({
        where: { email },
      });
    },

    findPublicById(userId: string): Promise<PublicUser | null> {
      return prisma.user.findUnique({
        where: { id: userId },
        select: publicUserSelect,
      });
    },

    async existsByEmail(email: string): Promise<boolean> {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      return user !== null;
    },
  };
}
