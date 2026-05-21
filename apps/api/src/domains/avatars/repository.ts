import {
  createAvatarAgentRepository,
  type PrismaClientInstance,
} from "@yuni/db";
import type {
  AvatarStatus,
  CreateAvatarAgentInput,
  LiveAvatarConfig,
  UpdateAvatarAgentInput,
  VoiceConfig,
} from "@yuni/domain";

export type AvatarAgentRecord = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: unknown;
  liveAvatarConfig: unknown;
  status: AvatarStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AvatarAgentDto = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: VoiceConfig;
  liveAvatarConfig: LiveAvatarConfig;
  status: AvatarStatus;
  createdAt: string;
  updatedAt: string;
};

export type AvatarsRepository = {
  create(ownerId: string, input: CreateAvatarAgentInput): Promise<AvatarAgentRecord>;
  listByOwner(ownerId: string): Promise<AvatarAgentRecord[]>;
  findByIdForOwner(ownerId: string, avatarId: string): Promise<AvatarAgentRecord | null>;
  updateForOwner(
    ownerId: string,
    avatarId: string,
    input: UpdateAvatarAgentInput
  ): Promise<AvatarAgentRecord>;
  deleteForOwner(ownerId: string, avatarId: string): Promise<AvatarAgentRecord>;
};

export function createAvatarsRepository(prisma: PrismaClientInstance): AvatarsRepository {
  return createAvatarAgentRepository(prisma);
}

export function toAvatarAgentDto(record: AvatarAgentRecord): AvatarAgentDto {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    instructions: record.instructions,
    context: record.context,
    voiceConfig: record.voiceConfig as VoiceConfig,
    liveAvatarConfig: record.liveAvatarConfig as LiveAvatarConfig,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
