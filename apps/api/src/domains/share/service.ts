import {
  LiveAvatarConfigSchema,
  NotFoundError,
  OwnershipError,
  type CreateShareLinkInput,
  type UpdateShareLinkInput,
} from "@yuni/domain";
import type { ShareLinkRecord, ShareLinksRepository } from "./repository";

export type ShareLinkDto = {
  id: string;
  avatarAgentId: string;
  slug: string;
  name: string;
  isEnabled: boolean;
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type PublicSharedAvatarDto = {
  shareLink: {
    slug: string;
    name: string;
  };
  avatar: {
    name: string;
    description: string;
    thumbnailUrl: string | null;
  };
  capabilities: {
    voice: "ready" | "unavailable";
  };
};

export class DuplicateShareSlugError extends Error {
  constructor() {
    super("Share link slug already exists");
    this.name = "DuplicateShareSlugError";
  }
}

export type ShareLinksServiceDependencies = {
  repository: ShareLinksRepository;
  publicBaseUrl: string;
};

export function createShareLinksService({ repository, publicBaseUrl }: ShareLinksServiceDependencies) {
  return {
    async createShareLink(
      ownerId: string,
      avatarId: string,
      input: CreateShareLinkInput
    ): Promise<ShareLinkDto> {
      try {
        return toShareLinkDto(await repository.create(ownerId, avatarId, input), publicBaseUrl);
      } catch (error) {
        throw normalizeShareLinkError(error);
      }
    },

    async listShareLinks(ownerId: string, avatarId: string): Promise<ShareLinkDto[]> {
      try {
        const shareLinks = await repository.listForAvatar(ownerId, avatarId);

        return shareLinks.map((shareLink) => toShareLinkDto(shareLink, publicBaseUrl));
      } catch (error) {
        throw normalizeShareLinkError(error);
      }
    },

    async updateShareLink(
      ownerId: string,
      avatarId: string,
      shareLinkId: string,
      input: UpdateShareLinkInput
    ): Promise<ShareLinkDto> {
      try {
        return toShareLinkDto(
          await repository.updateForAvatar(ownerId, avatarId, shareLinkId, input),
          publicBaseUrl
        );
      } catch (error) {
        throw normalizeShareLinkError(error);
      }
    },

    async deleteShareLink(ownerId: string, avatarId: string, shareLinkId: string): Promise<void> {
      try {
        await repository.deleteForAvatar(ownerId, avatarId, shareLinkId);
      } catch (error) {
        throw normalizeShareLinkError(error);
      }
    },

    async resolvePublicAvatar(slug: string): Promise<PublicSharedAvatarDto> {
      const shareLink = await repository.resolveEnabledBySlug(slug);

      if (!shareLink) {
        throw new NotFoundError("Public avatar not found");
      }

      const liveAvatarConfig = LiveAvatarConfigSchema.safeParse(shareLink.avatarAgent.liveAvatarConfig);

      return {
        shareLink: {
          slug: shareLink.slug,
          name: shareLink.name,
        },
        avatar: {
          name: shareLink.avatarAgent.name,
          description: shareLink.avatarAgent.description,
          thumbnailUrl: liveAvatarConfig.success ? (liveAvatarConfig.data.thumbnailUrl ?? null) : null,
        },
        capabilities: {
          voice:
            liveAvatarConfig.success &&
            Boolean(shareLink.avatarAgent.providerAgentId) &&
            Boolean(
              shareLink.avatarAgent.providerSyncStatus === "synced" ||
              shareLink.avatarAgent.providerLastUsableAt
            )
              ? "ready"
              : "unavailable",
        },
      };
    },
  };
}

export type ShareLinksService = ReturnType<typeof createShareLinksService>;

function toShareLinkDto(record: ShareLinkRecord, publicBaseUrl: string): ShareLinkDto {
  return {
    id: record.id,
    avatarAgentId: record.avatarAgentId,
    slug: record.slug,
    name: record.name,
    isEnabled: record.isEnabled,
    publicUrl: `${publicBaseUrl.replace(/\/$/, "")}/a/${record.slug}`,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
  };
}

function normalizeShareLinkError(error: unknown): Error {
  if (error instanceof OwnershipError) {
    return new NotFoundError("Share link not found");
  }

  if (isUniqueConstraintError(error)) {
    return new DuplicateShareSlugError();
  }

  return error instanceof Error ? error : new Error("Unknown share link error");
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
