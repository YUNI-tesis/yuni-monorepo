import {
  createUserRepository,
  type PrismaClientInstance,
  type PublicUser,
  type UserWithPassword,
} from "@yuni/db";

export type AuthRepository = {
  createWithPassword(input: { email: string; passwordHash: string; name?: string }): Promise<PublicUser>;
  findByEmail(email: string): Promise<UserWithPassword | null>;
  findPublicById(userId: string): Promise<PublicUser | null>;
  existsByEmail(email: string): Promise<boolean>;
};

export function toPublicUser(user: UserWithPassword): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    imageUrl: user.imageUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function createAuthRepository(prisma: PrismaClientInstance): AuthRepository {
  return createUserRepository(prisma);
}

export type { PublicUser, UserWithPassword };
