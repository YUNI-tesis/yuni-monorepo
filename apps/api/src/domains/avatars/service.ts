import type { CreateAvatarAgentInput, UpdateAvatarAgentInput } from "@yuni/domain";
import { NotFoundError, OwnershipError } from "@yuni/domain";
import type { LiveAvatarConfig } from "@yuni/config";
import type { AvatarAgentDto, AvatarsRepository } from "./repository";
import { toAvatarAgentDto } from "./repository";

export type AvatarsServiceDependencies = {
  repository: AvatarsRepository;
  liveAvatarConfig: Pick<LiveAvatarConfig, "mode" | "sandbox">;
};

export function createAvatarsService({ repository, liveAvatarConfig }: AvatarsServiceDependencies) {
  return {
    async createAvatar(ownerId: string, input: CreateAvatarAgentInput): Promise<AvatarAgentDto> {
      return toAvatarAgentDto(await repository.create(ownerId, withEffectiveLiveAvatarConfig(input, liveAvatarConfig)));
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
        return toAvatarAgentDto(
          await repository.updateForOwner(ownerId, avatarId, withEffectiveLiveAvatarConfig(input, liveAvatarConfig))
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

function withEffectiveLiveAvatarConfig<Input extends CreateAvatarAgentInput | UpdateAvatarAgentInput>(
  input: Input,
  config: Pick<LiveAvatarConfig, "mode" | "sandbox">
): Input {
  if (!input.liveAvatarConfig) {
    return input;
  }

  return {
    ...input,
    liveAvatarConfig: {
      ...input.liveAvatarConfig,
      mode: config.mode,
      sandbox: config.sandbox,
    },
  };
}
