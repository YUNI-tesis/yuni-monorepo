import { createShareLinkRepository, type PrismaClientInstance } from "@yuni/db";
import type { CreateShareLinkInput, UpdateShareLinkInput } from "@yuni/domain";

export type ShareLinkRecord = {
  id: string;
  avatarAgentId: string;
  ownerId: string;
  slug: string;
  name: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
};

export type PublicShareLinkRecord = ShareLinkRecord & {
  avatarAgent: {
    name: string;
    description: string;
    liveAvatarConfig: unknown;
    providerSyncStatus: "not_synced" | "syncing" | "synced" | "failed";
    providerAgentId: string | null;
    providerSyncedAt: Date | null;
    providerLastUsableAt?: Date | null;
  };
};

export type ShareLinksRepository = {
  create(ownerId: string, avatarAgentId: string, input: CreateShareLinkInput): Promise<ShareLinkRecord>;
  listForAvatar(ownerId: string, avatarAgentId: string): Promise<ShareLinkRecord[]>;
  updateForAvatar(
    ownerId: string,
    avatarAgentId: string,
    shareLinkId: string,
    input: UpdateShareLinkInput
  ): Promise<ShareLinkRecord>;
  deleteForAvatar(ownerId: string, avatarAgentId: string, shareLinkId: string): Promise<ShareLinkRecord>;
  resolveEnabledBySlug(slug: string): Promise<PublicShareLinkRecord | null>;
};

export function createShareLinksRepository(prisma: PrismaClientInstance): ShareLinksRepository {
  return createShareLinkRepository(prisma);
}
