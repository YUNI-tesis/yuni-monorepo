import {
  LiveAvatarConfigSchema,
  VoiceConfigSchema,
  type AvatarListScope,
  type CreateAvatarAgentInput,
  type UpdateAvatarAgentInput,
} from "@yuni/domain";
import { NotFoundError, OwnershipError } from "@yuni/domain";
import type { LiveAvatarConfig } from "@yuni/config";
import type { AvatarProvider } from "@yuni/avatars";
import {
  ElevenLabsProviderError,
  ElevenLabsProviderTimeoutError,
  ElevenLabsProviderUnavailableError,
  summarizeProviderError,
  type ElevenLabsAgentProvider,
  type ElevenLabsVoiceOption,
} from "@yuni/voice";
import type { CreateJobInput } from "@yuni/domain";
import type {
  AvatarAgentDto,
  AvatarAgentRecord,
  AvatarInteractionAvailability,
  AvatarListItemDto,
  AvatarsRepository,
} from "./repository";
import { toAvatarAgentDto } from "./repository";

export class AvatarVoiceNotFoundError extends Error {
  constructor(message = "Voice not found in ElevenLabs My Voices") {
    super(message);
    this.name = "AvatarVoiceNotFoundError";
  }
}

export type AvatarsServiceDependencies = {
  repository: AvatarsRepository;
  liveAvatarConfig: Pick<LiveAvatarConfig, "mode" | "sandbox">;
  avatarProvider?: Pick<AvatarProvider, "listAvatars">;
  elevenLabsVoiceProvider?: Pick<ElevenLabsAgentProvider, "listVoices">;
  elevenLabsAgentProvider?: Pick<ElevenLabsAgentProvider, "syncAvatarAgent">;
  jobs?: { enqueue(input: CreateJobInput): Promise<unknown> };
};

export function createAvatarsService(dependencies: AvatarsServiceDependencies) {
  const { repository, liveAvatarConfig, avatarProvider, elevenLabsVoiceProvider } = dependencies;

  return {
    async createAvatar(ownerId: string, input: CreateAvatarAgentInput): Promise<AvatarAgentDto> {
      const effectiveInput = await withEffectiveVoiceConfig(
        await withEffectiveLiveAvatarConfig(input, liveAvatarConfig, avatarProvider),
        elevenLabsVoiceProvider
      );
      const avatar =
        dependencies.jobs && repository.createWithProviderJobs
          ? await repository.createWithProviderJobs(ownerId, effectiveInput)
          : await repository.create(ownerId, effectiveInput);

      return toAvatarAgentDto(
        dependencies.jobs && repository.createWithProviderJobs
          ? avatar
          : await syncOrQueueAgentAfterSave(dependencies, ownerId, avatar)
      );
    },

    async listAvatars(ownerId: string, scope: AvatarListScope = "all"): Promise<AvatarListItemDto[]> {
      const [owned, shared] = await Promise.all([
        scope === "shared" ? Promise.resolve([]) : repository.listByOwner(ownerId),
        scope === "owned" || !repository.listSharedByUser
          ? Promise.resolve([])
          : repository.listSharedByUser(ownerId),
      ]);

      return [
        ...owned.map((avatar) => toAvatarListItemDto(avatar, "owner")),
        ...shared.map((avatar) => toAvatarListItemDto(avatar, "shared")),
      ].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    },

    async getAvatar(ownerId: string, avatarId: string): Promise<AvatarAgentDto> {
      const avatar = await repository.findByIdForOwner(ownerId, avatarId);

      if (!avatar) {
        throw new NotFoundError("Avatar not found");
      }

      return toAvatarAgentDto(avatar);
    },

    async getInteractionContext(userId: string, avatarId: string) {
      const access = await repository.findAccessibleForUser(userId, avatarId);

      if (!access) {
        throw new NotFoundError("Avatar not found");
      }

      const contextStatus =
        access.avatar.providerSyncStatus === "synced"
          ? "ready"
          : access.avatar.providerSyncStatus === "failed"
            ? "failed"
            : "processing";
      const hasValidConfiguration =
        VoiceConfigSchema.safeParse(access.avatar.voiceConfig).success &&
        LiveAvatarConfigSchema.safeParse(access.avatar.liveAvatarConfig).success;
      const voiceAvailability =
        access.type === "owner"
          ? hasValidConfiguration
            ? "ready"
            : "unavailable"
          : !hasValidConfiguration || access.avatar.providerSyncStatus === "failed"
            ? "unavailable"
            : access.avatar.providerAgentId &&
                (access.avatar.providerSyncStatus === "synced" || access.avatar.providerLastUsableAt)
              ? "ready"
              : "processing";

      return {
        avatar: {
          id: access.avatar.id,
          name: access.avatar.name,
          description: access.avatar.description,
          status: access.avatar.status,
        },
        access: {
          type: access.type,
          canInteract: true,
        },
        contextStatus,
        voiceAvailability,
      } as const;
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

        const effectiveInput = await withEffectiveVoiceConfig(
          await withEffectiveLiveAvatarConfig(input, liveAvatarConfig, avatarProvider, currentAvatar),
          elevenLabsVoiceProvider,
          currentAvatar
        );
        const updatedAvatar =
          dependencies.jobs && repository.updateWithProviderJobs
            ? await repository.updateWithProviderJobs(ownerId, avatarId, effectiveInput)
            : await repository.updateForOwner(ownerId, avatarId, effectiveInput);

        return toAvatarAgentDto(
          dependencies.jobs && repository.updateWithProviderJobs
            ? updatedAvatar
            : await syncOrQueueAgentAfterSave(dependencies, ownerId, updatedAvatar)
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
        if (repository.deleteWithCleanup) {
          await repository.deleteWithCleanup(ownerId, avatarId);
        } else {
          await repository.deleteForOwner(ownerId, avatarId);
        }
      } catch (error) {
        if (error instanceof OwnershipError) {
          throw new NotFoundError("Avatar not found");
        }

        throw error;
      }
    },
  };
}

export function toAvatarListItemDto(
  avatar: AvatarAgentRecord,
  accessType: "owner" | "shared"
): AvatarListItemDto {
  const isOwner = accessType === "owner";
  const parsedLiveAvatarConfig = LiveAvatarConfigSchema.safeParse(avatar.liveAvatarConfig);
  const hasValidConfiguration =
    VoiceConfigSchema.safeParse(avatar.voiceConfig).success && parsedLiveAvatarConfig.success;

  return {
    id: avatar.id,
    name: avatar.name,
    description: avatar.description,
    status: avatar.status,
    providerSyncStatus: avatar.providerSyncStatus,
    thumbnailUrl: parsedLiveAvatarConfig.success
      ? readSafeThumbnailUrl(parsedLiveAvatarConfig.data.thumbnailUrl)
      : null,
    interactionAvailability: getInteractionAvailability(avatar, accessType, hasValidConfiguration),
    createdAt: avatar.createdAt.toISOString(),
    updatedAt: avatar.updatedAt.toISOString(),
    access: {
      type: accessType,
      canEdit: isOwner,
      canShare: isOwner,
      canInteract: true,
    },
  };
}

function getInteractionAvailability(
  avatar: AvatarAgentRecord,
  accessType: "owner" | "shared",
  hasValidConfiguration: boolean
): AvatarInteractionAvailability {
  if (accessType === "owner") {
    return !hasValidConfiguration || avatar.providerSyncStatus === "failed" ? "needs_attention" : "ready";
  }

  if (!hasValidConfiguration || avatar.providerSyncStatus === "failed") {
    return "unavailable";
  }

  return avatar.providerAgentId && (avatar.providerSyncStatus === "synced" || avatar.providerLastUsableAt)
    ? "ready"
    : "preparing";
}

function readSafeThumbnailUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
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

async function withEffectiveVoiceConfig<Input extends CreateAvatarAgentInput | UpdateAvatarAgentInput>(
  input: Input,
  voiceProvider?: Pick<ElevenLabsAgentProvider, "listVoices">,
  currentAvatar?: AvatarAgentRecord
): Promise<Input> {
  if (!input.voiceConfig || input.voiceConfig.provider !== "elevenlabs" || !voiceProvider) {
    return input;
  }

  let voices: ElevenLabsVoiceOption[];

  try {
    voices = await voiceProvider.listVoices();
  } catch (error) {
    if (isElevenLabsProviderError(error)) {
      const trustedFallback = readReusableVoiceSnapshot(
        input.voiceConfig.voiceId,
        currentAvatar?.voiceConfig
      );

      if (trustedFallback) {
        return {
          ...input,
          voiceConfig: {
            provider: "elevenlabs",
            voiceId: input.voiceConfig.voiceId,
            speakingRate: input.voiceConfig.speakingRate,
            displayName: trustedFallback.displayName,
            ...(trustedFallback.description ? { description: trustedFallback.description } : {}),
          },
        };
      }

      throw error;
    }

    throw error;
  }

  const providerVoice = voices.find((voice) => voice.id === input.voiceConfig?.voiceId) ?? null;
  const trustedFallback = providerVoice
    ? null
    : readReusableVoiceSnapshot(input.voiceConfig.voiceId, currentAvatar?.voiceConfig);

  if (!providerVoice && !trustedFallback) {
    throw new AvatarVoiceNotFoundError();
  }

  const displayName = providerVoice?.displayName ?? trustedFallback?.displayName;
  const description = providerVoice?.description || trustedFallback?.description;

  return {
    ...input,
    voiceConfig: {
      provider: "elevenlabs",
      voiceId: input.voiceConfig.voiceId,
      speakingRate: input.voiceConfig.speakingRate,
      ...(displayName ? { displayName } : {}),
      ...(description ? { description } : {}),
    },
  };
}

function isElevenLabsProviderError(error: unknown): error is ElevenLabsProviderError {
  return (
    error instanceof ElevenLabsProviderUnavailableError ||
    error instanceof ElevenLabsProviderTimeoutError ||
    error instanceof ElevenLabsProviderError
  );
}

async function syncAgentAfterSave(
  dependencies: AvatarsServiceDependencies,
  ownerId: string,
  avatar: AvatarAgentRecord
): Promise<AvatarAgentRecord> {
  if (!dependencies.elevenLabsAgentProvider) {
    return avatar;
  }

  const parsedVoiceConfig = VoiceConfigSchema.safeParse(avatar.voiceConfig);

  if (!parsedVoiceConfig.success) {
    return dependencies.repository.updateProviderSync(ownerId, avatar.id, {
      agentProvider: "elevenlabs_agents",
      providerSyncStatus: "failed",
      providerSyncError: "Avatar voice config is invalid",
      providerSyncedAt: null,
    });
  }

  try {
    const sync = await dependencies.elevenLabsAgentProvider.syncAvatarAgent({
      id: avatar.id,
      name: avatar.name,
      description: avatar.description,
      instructions: avatar.instructions,
      context: avatar.context,
      voiceConfig: parsedVoiceConfig.data,
      providerAgentId: avatar.providerAgentId,
      providerSyncFingerprint: avatar.providerSyncStatus === "synced" ? avatar.providerSyncFingerprint : null,
    });

    return dependencies.repository.updateProviderSync(ownerId, avatar.id, {
      agentProvider: "elevenlabs_agents",
      providerAgentId: sync.providerAgentId,
      providerSyncStatus: "synced",
      providerSyncError: null,
      providerSyncedAt: sync.synced ? new Date() : avatar.providerSyncedAt,
      providerSyncFingerprint: sync.providerSyncFingerprint,
    });
  } catch (error) {
    return dependencies.repository.updateProviderSync(ownerId, avatar.id, {
      agentProvider: "elevenlabs_agents",
      providerSyncStatus: "failed",
      providerSyncError: summarizeProviderError(error),
      providerSyncedAt: null,
    });
  }
}

async function syncOrQueueAgentAfterSave(
  dependencies: AvatarsServiceDependencies,
  ownerId: string,
  avatar: AvatarAgentRecord
) {
  if (!dependencies.jobs) return syncAgentAfterSave(dependencies, ownerId, avatar);

  const queuedAvatar = await dependencies.repository.updateProviderSync(ownerId, avatar.id, {
    agentProvider: "elevenlabs_agents",
    providerSyncStatus: "syncing",
    providerSyncError: null,
  });
  const contextFingerprint = await sha256(avatar.context);
  const contextIsReady =
    avatar.providerContextSyncStatus === "synced" && avatar.providerContextFingerprint === contextFingerprint;
  await dependencies.jobs.enqueue(
    contextIsReady
      ? {
          ownerId,
          avatarAgentId: avatar.id,
          type: "agent_provider_sync",
          payload: { avatarId: avatar.id },
          dedupeKey: `agent-sync:${avatar.id}:${avatar.updatedAt.getTime()}`,
          maxAttempts: 8,
        }
      : {
          ownerId,
          avatarAgentId: avatar.id,
          type: "avatar_context_provider_sync",
          payload: { avatarId: avatar.id, contextFingerprint },
          dedupeKey: `avatar-context:${avatar.id}:${contextFingerprint}:${avatar.updatedAt.getTime()}`,
          maxAttempts: 8,
        }
  );
  return queuedAvatar;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readReusableLiveAvatarSnapshot(avatarId: string, currentConfig: unknown) {
  if (
    !isRecord(currentConfig) ||
    currentConfig.provider !== "liveavatar" ||
    currentConfig.avatarId !== avatarId
  ) {
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

function readReusableVoiceSnapshot(voiceId: string, currentConfig: unknown) {
  if (
    !isRecord(currentConfig) ||
    currentConfig.provider !== "elevenlabs" ||
    currentConfig.voiceId !== voiceId
  ) {
    return null;
  }

  const displayName = readString(currentConfig.displayName);

  if (!displayName) {
    return null;
  }

  return {
    displayName,
    description: readString(currentConfig.description),
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
