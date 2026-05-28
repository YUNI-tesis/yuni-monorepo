import type { CreateAvatarAgentInput, UpdateAvatarAgentInput } from "@yuni/domain";
import { NotFoundError, OwnershipError } from "@yuni/domain";
import type { LiveAvatarConfig } from "@yuni/config";
import type { AvatarProvider } from "@yuni/avatars";
import type { AvatarAgentDto, AvatarAgentRecord, AvatarsRepository } from "./repository";
import { toAvatarAgentDto } from "./repository";

export type AvatarsServiceDependencies = {
  repository: AvatarsRepository;
  liveAvatarConfig: Pick<LiveAvatarConfig, "mode" | "sandbox">;
  avatarProvider?: Pick<AvatarProvider, "listAvatars">;
};

export function createAvatarsService({ repository, liveAvatarConfig, avatarProvider }: AvatarsServiceDependencies) {
  return {
    async createAvatar(ownerId: string, input: CreateAvatarAgentInput): Promise<AvatarAgentDto> {
      return toAvatarAgentDto(
        await repository.create(
          ownerId,
          await withEffectiveLiveAvatarConfig(input, liveAvatarConfig, avatarProvider)
        )
      );
    },

    async listAvatars(ownerId: string): Promise<AvatarAgentDto[]> {
      const avatars = await repository.listByOwner(ownerId);

      return avatars.map(toAvatarAgentDto);
    },

    async getAvatar(ownerId: string, avatarId: string): Promise<AvatarAgentDto> {
      const avatar = await repository.findByIdForOwner(ownerId, avatarId);

      if (!avatar) {
        throw new NotFoundError("Avatar not found");
      }

      return toAvatarAgentDto(avatar);
    },

    async updateAvatar(
      ownerId: string,
      avatarId: string,
      input: UpdateAvatarAgentInput
    ): Promise<AvatarAgentDto> {
      try {
        const currentAvatar = await repository.findByIdForOwner(ownerId, avatarId);

        if (!currentAvatar) {
          throw new NotFoundError("Avatar not found");
        }

        return toAvatarAgentDto(
          await repository.updateForOwner(
            ownerId,
            avatarId,
            await withEffectiveLiveAvatarConfig(input, liveAvatarConfig, avatarProvider, currentAvatar)
          )
        );
      } catch (error) {
        if (error instanceof OwnershipError) {
          throw new NotFoundError("Avatar not found");
        }

        throw error;
      }
    },

    async deleteAvatar(ownerId: string, avatarId: string): Promise<void> {
      try {
        await repository.deleteForOwner(ownerId, avatarId);
      } catch (error) {
        if (error instanceof OwnershipError) {
          throw new NotFoundError("Avatar not found");
        }

        throw error;
      }
    },
  };
}

export type AvatarsService = ReturnType<typeof createAvatarsService>;

async function withEffectiveLiveAvatarConfig<Input extends CreateAvatarAgentInput | UpdateAvatarAgentInput>(
  input: Input,
  config: Pick<LiveAvatarConfig, "mode" | "sandbox">,
  avatarProvider?: Pick<AvatarProvider, "listAvatars">,
  currentAvatar?: AvatarAgentRecord
): Promise<Input> {
  if (!input.liveAvatarConfig) {
    return input;
  }

  const providerAvatar = await findProviderAvatar(input.liveAvatarConfig.avatarId, avatarProvider);
  const trustedFallback = providerAvatar
    ? null
    : readReusableLiveAvatarSnapshot(input.liveAvatarConfig.avatarId, currentAvatar?.liveAvatarConfig);
  const liveAvatarConfig = {
    provider: "liveavatar" as const,
    avatarId: input.liveAvatarConfig.avatarId,
    mode: config.mode,
    sandbox: config.sandbox,
    ...(providerAvatar ? { displayName: providerAvatar.displayName } : {}),
    ...(providerAvatar?.thumbnailUrl ? { thumbnailUrl: providerAvatar.thumbnailUrl } : {}),
    ...(trustedFallback ? { displayName: trustedFallback.displayName } : {}),
    ...(trustedFallback?.thumbnailUrl ? { thumbnailUrl: trustedFallback.thumbnailUrl } : {}),
  };

  return {
    ...input,
    liveAvatarConfig,
  };
}

function readReusableLiveAvatarSnapshot(avatarId: string, currentConfig: unknown) {
  if (!isRecord(currentConfig) || currentConfig.provider !== "liveavatar" || currentConfig.avatarId !== avatarId) {
    return null;
  }

  const displayName = readString(currentConfig.displayName);

  if (!displayName) {
    return null;
  }

  return {
    displayName,
    thumbnailUrl: readString(currentConfig.thumbnailUrl),
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function findProviderAvatar(avatarId: string, avatarProvider?: Pick<AvatarProvider, "listAvatars">) {
  if (!avatarProvider) {
    return null;
  }

  try {
    const avatars = await avatarProvider.listAvatars();

    return avatars.find((avatar) => avatar.id === avatarId) ?? null;
  } catch {
    return null;
  }
}
