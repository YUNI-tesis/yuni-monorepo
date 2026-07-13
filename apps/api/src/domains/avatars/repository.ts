import {
  createAvatarAgentRepository,
  type PrismaClientInstance,
} from "@yuni/db";
import type {
  AgentProvider,
  AvatarStatus,
  CreateAvatarAgentInput,
  LiveAvatarConfig,
  ProviderSyncStatus,
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
  agentProvider: AgentProvider;
  providerAgentId: string | null;
  providerSyncStatus: ProviderSyncStatus;
  providerSyncError: string | null;
  providerSyncedAt: Date | null;
  providerSyncFingerprint: string | null;
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
  agentProvider: AgentProvider;
  providerAgentId: string | null;
  providerSyncStatus: ProviderSyncStatus;
  providerSyncError: string | null;
  providerSyncedAt: string | null;
  providerSyncFingerprint: string | null;
  status: AvatarStatus;
  createdAt: string;
  updatedAt: string;
};

export type AvatarsRepository = {
  create(ownerId: string, input: CreateAvatarAgentInput): Promise<AvatarAgentRecord>;
  listByOwner(ownerId: string): Promise<AvatarAgentRecord[]>;
  findByIdForOwner(ownerId: string, avatarId: string): Promise<AvatarAgentRecord | null>;
  updateProviderSync(
    ownerId: string,
    avatarId: string,
    input: {
      agentProvider?: AgentProvider;
      providerAgentId?: string | null;
      providerSyncStatus: ProviderSyncStatus;
      providerSyncError?: string | null;
      providerSyncedAt?: Date | null;
      providerSyncFingerprint?: string | null;
    }
  ): Promise<AvatarAgentRecord>;
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
    agentProvider: record.agentProvider,
    providerAgentId: record.providerAgentId,
    providerSyncStatus: record.providerSyncStatus,
    providerSyncError: record.providerSyncError,
    providerSyncedAt: record.providerSyncedAt?.toISOString() ?? null,
    providerSyncFingerprint: record.providerSyncFingerprint,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
