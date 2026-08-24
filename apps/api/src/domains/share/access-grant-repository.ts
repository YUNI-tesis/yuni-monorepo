import { createAccessGrantRepository, type PrismaClientInstance } from "@yuni/db";
import type { AccessGrantStatus, CreateAccessGrantInput, UpdateAccessGrantInput } from "@yuni/domain";
import type { InteractionLimitRecord } from "../external-sessions/limits";

export type AccessGrantRecord = InteractionLimitRecord & {
  id: string;
  avatarAgentId: string;
  ownerId: string;
  participantEmail: string;
  participantUserId: string | null;
  status: AccessGrantStatus;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AccessGrantsRepository = {
  create(ownerId: string, avatarAgentId: string, input: CreateAccessGrantInput): Promise<AccessGrantRecord>;
  listForAvatar(ownerId: string, avatarAgentId: string): Promise<AccessGrantRecord[]>;
  updateForAvatar(
    ownerId: string,
    avatarAgentId: string,
    accessGrantId: string,
    input: UpdateAccessGrantInput
  ): Promise<AccessGrantRecord>;
  deleteForAvatar(
    ownerId: string,
    avatarAgentId: string,
    accessGrantId: string
  ): Promise<{ outcome: "deleted" | "revoked"; accessGrant: AccessGrantRecord }>;
  linkActiveForUser(userId: string, participantEmail: string): Promise<unknown>;
};

export function createAccessGrantsRepository(prisma: PrismaClientInstance): AccessGrantsRepository {
  return createAccessGrantRepository(prisma);
}
