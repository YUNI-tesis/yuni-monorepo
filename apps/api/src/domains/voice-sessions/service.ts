import {
  EndVoiceSessionInputSchema,
  LiveAvatarConfigSchema,
  NotFoundError,
  VoiceConfigSchema,
  type EndVoiceSessionInput,
  type VoiceSessionTranscriptEntry,
} from "@yuni/domain";
import {
  fallbackConversationTitle,
  type ConversationTitleGenerator,
  type ConversationTitleMessage,
} from "@yuni/ai";
import {
  AvatarProviderError,
  AvatarProviderTimeoutError,
  AvatarProviderUnavailableError,
  type AvatarProvider,
} from "@yuni/avatars";
import {
  ElevenLabsProviderError,
  ElevenLabsProviderTimeoutError,
  ElevenLabsProviderUnavailableError,
  summarizeProviderError,
  type ElevenLabsAgentProvider,
} from "@yuni/voice";
import { createLogger } from "@yuni/observability";
import type { AvatarAgentRecord, AvatarsRepository } from "../avatars/repository";

const logger = createLogger("@yuni/api:voice-sessions");

export class VoiceSessionConfigurationError extends Error {
  constructor(message = "Voice session is not configured") {
    super(message);
    this.name = "VoiceSessionConfigurationError";
  }
}

export class VoiceProviderServiceError extends Error {
  constructor(message = "Voice provider failed") {
    super(message);
    this.name = "VoiceProviderServiceError";
  }
}

export class VoiceProviderTimeoutServiceError extends Error {
  constructor(message = "Voice provider timed out") {
    super(message);
    this.name = "VoiceProviderTimeoutServiceError";
  }
}

export class LiveAvatarSessionServiceError extends Error {
  constructor(message = "Live Avatar session failed") {
    super(message);
    this.name = "LiveAvatarSessionServiceError";
  }
}

export class LiveAvatarSessionTimeoutServiceError extends Error {
  constructor(message = "Live Avatar session timed out") {
    super(message);
    this.name = "LiveAvatarSessionTimeoutServiceError";
  }
}

export type VoiceSessionsServiceDependencies = {
  avatarsRepository: Pick<AvatarsRepository, "findByIdForOwner" | "updateProviderSync">;
  conversationsRepository: {
    createPrivate(ownerId: string, avatarAgentId: string, mode: "voice"): Promise<{ id: string }>;
    markEnded(id: string): Promise<unknown>;
    updateTitle(id: string, title: string): Promise<unknown>;
  };
  realtimeSessionsRepository: {
    create(input: { avatarAgentId: string; conversationId: string }): Promise<{ id: string }>;
    findPrivateForOwner(
      ownerId: string,
      realtimeSessionId: string
    ): Promise<{
      id: string;
      conversationId: string | null;
      avatarAgentId: string;
      providerSessionId: string | null;
      status: string;
      endedAt: Date | null;
      conversation: { id: string; status: string } | null;
    } | null>;
    markActive(id: string, providerSessionId?: string): Promise<{
      id: string;
      conversationId: string | null;
      providerSessionId: string | null;
      status: string;
      endedAt: Date | null;
    }>;
    markEnded(id: string): Promise<{
      id: string;
      conversationId: string | null;
      providerSessionId: string | null;
      status: string;
      endedAt: Date | null;
    }>;
    markErrored(id: string, errorMessage: string): Promise<unknown>;
  };
  messagesRepository: {
    append(conversationId: string, input: { role: "user" | "assistant"; content: string; metadata?: Record<string, unknown> }): Promise<unknown>;
  };
  liveAvatarProvider: Pick<AvatarProvider, "createLiteSessionToken">;
  elevenLabsAgentProvider: Pick<ElevenLabsAgentProvider, "syncAvatarAgent">;
  conversationTitleGenerator?: ConversationTitleGenerator;
};

export function createVoiceSessionsService(dependencies: VoiceSessionsServiceDependencies) {
  return {
    async syncAgentProvider(ownerId: string, avatarId: string) {
      const avatar = await findOwnedAvatar(dependencies.avatarsRepository, ownerId, avatarId);

      return syncAvatarAgent(dependencies, ownerId, avatar, { force: true });
    },

    async startVoiceSession(ownerId: string, avatarId: string) {
      const avatar = await findOwnedAvatar(dependencies.avatarsRepository, ownerId, avatarId);
      const liveAvatarConfig = parseLiveAvatarConfig(avatar);
      const sync = await syncAvatarAgent(dependencies, ownerId, avatar, { force: false });
      const conversation = await dependencies.conversationsRepository.createPrivate(ownerId, avatar.id, "voice");
      const realtimeSession = await dependencies.realtimeSessionsRepository.create({
        avatarAgentId: avatar.id,
        conversationId: conversation.id,
      });

      try {
        const liveAvatarSession = await dependencies.liveAvatarProvider.createLiteSessionToken({
          avatarId: liveAvatarConfig.avatarId,
          elevenLabsAgentId: sync.providerAgentId,
        });
        const activeSession = await dependencies.realtimeSessionsRepository.markActive(
          realtimeSession.id,
          liveAvatarSession.sessionId ?? undefined
        );

        return {
          conversationId: conversation.id,
          realtimeSessionId: activeSession.id,
          providerAgentId: sync.providerAgentId,
          sessionToken: liveAvatarSession.sessionToken,
          sessionId: liveAvatarSession.sessionId,
        };
      } catch (error) {
        await markRealtimeSessionErrored(dependencies, realtimeSession.id, error);
        await markConversationEndedAfterStartFailure(dependencies, conversation.id, error);
        logger.error("Live Avatar session creation failed", {
          error: summarizeStructuredError(error),
          avatarId: avatar.id,
          liveAvatarAvatarId: liveAvatarConfig.avatarId,
          providerAgentId: sync.providerAgentId,
          realtimeSessionId: realtimeSession.id,
        });

        if (error instanceof AvatarProviderUnavailableError) {
          throw new VoiceSessionConfigurationError("Live Avatar ElevenLabs connector is not configured");
        }

        if (error instanceof AvatarProviderTimeoutError) {
          throw new LiveAvatarSessionTimeoutServiceError();
        }

        if (error instanceof AvatarProviderError) {
          throw new LiveAvatarSessionServiceError(error.message);
        }

        throw error;
      }
    },

    async endVoiceSession(ownerId: string, realtimeSessionId: string, input: EndVoiceSessionInput) {
      const parsed = EndVoiceSessionInputSchema.parse(input);
      const realtimeSession = await dependencies.realtimeSessionsRepository.findPrivateForOwner(
        ownerId,
        realtimeSessionId
      );

      if (!realtimeSession) {
        throw new NotFoundError("Voice session not found");
      }

      if (realtimeSession.status === "ended") {
        return toVoiceSessionDto(realtimeSession);
      }

      if (realtimeSession.conversationId) {
        await appendTranscript(dependencies, realtimeSession.conversationId, parsed.transcript);
        await dependencies.conversationsRepository.markEnded(realtimeSession.conversationId);
        await updateEndedVoiceConversationTitle(dependencies, ownerId, realtimeSession, parsed.transcript);
      }

      return toVoiceSessionDto(await dependencies.realtimeSessionsRepository.markEnded(realtimeSession.id));
    },
  };
}

export type VoiceSessionsService = ReturnType<typeof createVoiceSessionsService>;

async function findOwnedAvatar(
  repository: Pick<AvatarsRepository, "findByIdForOwner">,
  ownerId: string,
  avatarId: string
): Promise<AvatarAgentRecord> {
  const avatar = await repository.findByIdForOwner(ownerId, avatarId);

  if (!avatar) {
    throw new NotFoundError("Avatar not found");
  }

  return avatar;
}

async function syncAvatarAgent(
  dependencies: VoiceSessionsServiceDependencies,
  ownerId: string,
  avatar: AvatarAgentRecord,
  options: { force: boolean }
) {
  const voiceConfig = parseVoiceConfig(avatar);

  try {
    const sync = await dependencies.elevenLabsAgentProvider.syncAvatarAgent({
      id: avatar.id,
      name: avatar.name,
      description: avatar.description,
      instructions: avatar.instructions,
      context: avatar.context,
      voiceConfig,
      providerAgentId: avatar.providerAgentId,
      providerSyncFingerprint:
        options.force || avatar.providerSyncStatus !== "synced" ? null : avatar.providerSyncFingerprint,
    });

    await dependencies.avatarsRepository.updateProviderSync(ownerId, avatar.id, {
      agentProvider: "elevenlabs_agents",
      providerAgentId: sync.providerAgentId,
      providerSyncStatus: "synced",
      providerSyncError: null,
      providerSyncedAt: sync.synced ? new Date() : avatar.providerSyncedAt,
      providerSyncFingerprint: sync.providerSyncFingerprint,
    });

    return sync;
  } catch (error) {
    await dependencies.avatarsRepository.updateProviderSync(ownerId, avatar.id, {
      agentProvider: "elevenlabs_agents",
      providerSyncStatus: "failed",
      providerSyncError: summarizeProviderError(error),
      providerSyncedAt: null,
    });

    if (error instanceof ElevenLabsProviderUnavailableError) {
      throw new VoiceSessionConfigurationError("ElevenLabs is not configured");
    }

    if (error instanceof ElevenLabsProviderTimeoutError) {
      throw new VoiceProviderTimeoutServiceError();
    }

    if (error instanceof ElevenLabsProviderError) {
      throw new VoiceProviderServiceError(error.message);
    }

    throw error;
  }
}

function parseVoiceConfig(avatar: AvatarAgentRecord) {
  const parsed = VoiceConfigSchema.safeParse(avatar.voiceConfig);

  if (!parsed.success) {
    throw new VoiceSessionConfigurationError("Avatar voice config is invalid");
  }

  return parsed.data;
}

function parseLiveAvatarConfig(avatar: AvatarAgentRecord) {
  const parsed = LiveAvatarConfigSchema.safeParse(avatar.liveAvatarConfig);

  if (!parsed.success) {
    throw new VoiceSessionConfigurationError("Avatar Live Avatar config is invalid");
  }

  return parsed.data;
}

async function appendTranscript(
  dependencies: VoiceSessionsServiceDependencies,
  conversationId: string,
  transcript: VoiceSessionTranscriptEntry[]
) {
  for (const entry of transcript) {
    await dependencies.messagesRepository.append(conversationId, {
      role: entry.role,
      content: entry.content,
      metadata: {
        source: "liveavatar_sdk",
        ...(entry.metadata ?? {}),
      },
    });
  }
}

async function updateEndedVoiceConversationTitle(
  dependencies: VoiceSessionsServiceDependencies,
  ownerId: string,
  realtimeSession: { conversationId: string | null; avatarAgentId: string },
  transcript: VoiceSessionTranscriptEntry[]
) {
  if (!realtimeSession.conversationId) {
    return;
  }

  try {
    const avatar = await dependencies.avatarsRepository.findByIdForOwner(ownerId, realtimeSession.avatarAgentId);
    const titleInput = {
      ...(avatar?.name ? { avatarName: avatar.name } : {}),
      messages: transcript.map(toConversationTitleMessage),
    };
    const generatedTitle = await generateConversationTitle(dependencies.conversationTitleGenerator, titleInput);
    const title = generatedTitle ?? fallbackConversationTitle(titleInput);

    await dependencies.conversationsRepository.updateTitle(realtimeSession.conversationId, title);
  } catch (error) {
    logger.error("Failed to update voice conversation title", {
      error: summarizeStructuredError(error),
      conversationId: realtimeSession.conversationId,
      avatarAgentId: realtimeSession.avatarAgentId,
    });
  }
}

async function generateConversationTitle(
  generator: ConversationTitleGenerator | undefined,
  input: { avatarName?: string; messages: ConversationTitleMessage[] }
) {
  try {
    return (await generator?.generateTitle(input)) ?? null;
  } catch (error) {
    logger.error("OpenAI voice conversation title generation failed", {
      error: summarizeStructuredError(error),
    });
    return null;
  }
}

function toConversationTitleMessage(entry: VoiceSessionTranscriptEntry): ConversationTitleMessage {
  return {
    role: entry.role,
    content: entry.content,
  };
}

function toVoiceSessionDto(session: {
  id: string;
  conversationId: string | null;
  providerSessionId: string | null;
  status: string;
  endedAt: Date | null;
}) {
  return {
    id: session.id,
    conversationId: session.conversationId,
    providerSessionId: session.providerSessionId,
    status: session.status,
    endedAt: session.endedAt?.toISOString() ?? null,
  };
}

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : "Voice session failed";
}

async function markRealtimeSessionErrored(
  dependencies: VoiceSessionsServiceDependencies,
  realtimeSessionId: string,
  error: unknown
) {
  try {
    await dependencies.realtimeSessionsRepository.markErrored(realtimeSessionId, summarizeError(error));
  } catch (cleanupError) {
    logger.error("Failed to mark realtime session as errored", {
      error: summarizeStructuredError(cleanupError),
      realtimeSessionId,
    });
  }
}

async function markConversationEndedAfterStartFailure(
  dependencies: VoiceSessionsServiceDependencies,
  conversationId: string,
  error: unknown
) {
  try {
    await dependencies.conversationsRepository.markEnded(conversationId);
  } catch (cleanupError) {
    logger.error("Failed to mark voice conversation as ended after session start failure", {
      error: summarizeStructuredError(cleanupError),
      originalError: summarizeStructuredError(error),
      conversationId,
    });
  }
}

function summarizeStructuredError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: "Voice session failed",
  };
}
