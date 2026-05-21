import type { CreateAvatarAgentInput, UpdateAvatarAgentInput } from "@yuni/domain";
import { NotFoundError, OwnershipError } from "@yuni/domain";
import type { AvatarAgentDto, AvatarsRepository } from "./repository";
import { toAvatarAgentDto } from "./repository";

export type AvatarsServiceDependencies = {
  repository: AvatarsRepository;
};

export function createAvatarsService({ repository }: AvatarsServiceDependencies) {
  return {
    async createAvatar(ownerId: string, input: CreateAvatarAgentInput): Promise<AvatarAgentDto> {
      return toAvatarAgentDto(await repository.create(ownerId, input));
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
        return toAvatarAgentDto(await repository.updateForOwner(ownerId, avatarId, input));
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
