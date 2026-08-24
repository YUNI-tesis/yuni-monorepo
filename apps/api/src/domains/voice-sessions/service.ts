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
import { hasUsableAvatarProviderVersion } from "../avatars/provider-availability";
import type { RateLimiter } from "../public-sessions/rate-limiter";
import type { ExternalSessionPolicyService } from "../external-sessions/policy";
import type { ProviderTokenProtector } from "../public-sessions/provider-token-protector";
import type { createExternalSessionPolicyRepository } from "@yuni/db";
import {
  EXTERNAL_MAINTENANCE_BATCH_SIZE,
  EXTERNAL_MAINTENANCE_MAX_BATCHES,
  EXTERNAL_PROVIDER_STOP_CONCURRENCY,
  EXTERNAL_RECORD_CLEANUP_CONCURRENCY,
  EXTERNAL_SESSION_FINALIZATION_GRACE_MS,
  EXTERNAL_SESSION_START_ERROR_MESSAGE,
  runWithConcurrency,
} from "../external-sessions/lifecycle";

const logger = createLogger("@yuni/api:voice-sessions");

export class VoiceSessionConfigurationError extends Error {
  constructor(message = "Voice session is not configured") {
    super(message);
    this.name = "VoiceSessionConfigurationError";
  }
}

export class SharedAvatarNotReadyError extends Error {
  constructor(message = "Shared avatar is not ready") {
    super(message);
    this.name = "SharedAvatarNotReadyError";
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

export class ExternalSessionLifecycleConfigurationError extends Error {
  constructor() {
    super("External session lifecycle is not configured");
    this.name = "ExternalSessionLifecycleConfigurationError";
  }
}

export type VoiceSessionsServiceDependencies = {
  avatarsRepository: Pick<
    AvatarsRepository,
    "findByIdForOwner" | "findAccessibleForUser" | "updateProviderSync"
  >;
  conversationsRepository: {
    createPrivateForParticipant(input: {
      ownerId: string;
      avatarAgentId: string;
      mode: "voice";
      accessGrantId?: string;
      participantEmail?: string;
    }): Promise<{ id: string }>;
    markEnded(id: string): Promise<unknown>;
    updateTitle(id: string, title: string): Promise<unknown>;
  };
  realtimeSessionsRepository: {
    create(input: {
      avatarAgentId: string;
      conversationId: string;
      expiresAt?: Date;
      accessGrantId?: string;
    }): Promise<{ id: string }>;
    findPrivateForParticipant(
      participantUserId: string,
      realtimeSessionId: string
    ): Promise<{
      id: string;
      conversationId: string | null;
      avatarAgentId: string;
      providerSessionId: string | null;
      providerSessionTokenCiphertext?: string | null;
      providerStoppedAt?: Date | null;
      expiresAt?: Date | null;
      status: string;
      endedAt: Date | null;
      conversation: { id: string; status: string } | null;
    } | null>;
    markActive(
      id: string,
      providerSessionId?: string,
      providerSessionTokenCiphertext?: string
    ): Promise<{
      id: string;
      conversationId: string | null;
      providerSessionId: string | null;
      providerSessionTokenCiphertext?: string | null;
      providerStoppedAt?: Date | null;
      expiresAt?: Date | null;
      status: string;
      endedAt: Date | null;
    } | null>;
    markEnded(id: string): Promise<{
      id: string;
      conversationId: string | null;
      providerSessionId: string | null;
      status: string;
      endedAt: Date | null;
    }>;
    finalizePrivate(input: {
      realtimeSessionId: string;
      conversationId: string;
      transcript: Array<{ role: "user" | "assistant"; content: string }>;
      title: string;
    }): Promise<{
      session: {
        id: string;
        conversationId: string | null;
        status: string;
        endedAt: Date | null;
      };
      finalized: boolean;
    } | null>;
    markErrored(id: string, errorMessage: string, providerSessionTokenCiphertext?: string): Promise<unknown>;
    markProviderStopped(id: string): Promise<unknown>;
    expireSharedIfActive(id: string, conversationId: string | null): Promise<unknown>;
  };
  liveAvatarProvider: Pick<AvatarProvider, "createLiteSessionToken" | "stopSession">;
  elevenLabsAgentProvider: Pick<ElevenLabsAgentProvider, "syncAvatarAgent">;
  conversationTitleGenerator?: ConversationTitleGenerator;
  backgroundSyncEnabled?: boolean;
  externalSessions?: {
    policyService: ExternalSessionPolicyService;
    policyRepository: ReturnType<typeof createExternalSessionPolicyRepository>;
    rateLimiter: RateLimiter;
    providerTokenProtector: ProviderTokenProtector;
    rateLimits: {
      startIpTarget: number;
      startParticipantTarget: number;
      startAvatar: number;
    };
    schedule?: (callback: () => void, delayMs: number) => void;
  };
};

export function createVoiceSessionsService(dependencies: VoiceSessionsServiceDependencies) {
  let providerStopCursor: string | undefined;
  let providerStopRun: Promise<void> | null = null;

  return {
    async syncAgentProvider(ownerId: string, avatarId: string) {
      const avatar = await findOwnedAvatar(dependencies.avatarsRepository, ownerId, avatarId);

      return syncAvatarAgent(dependencies, ownerId, avatar, { force: true });
    },

    async startVoiceSession(userId: string, avatarId: string, ip = "unknown") {
      const access = await dependencies.avatarsRepository.findAccessibleForUser(userId, avatarId);

      if (!access) {
        throw new NotFoundError("Avatar not found");
      }

      const avatar = access.avatar;
      const liveAvatarConfig =
        access.type === "shared" ? parseSharedLiveAvatarConfig(avatar) : parseLiveAvatarConfig(avatar);
      const providerAgentId =
        access.type === "owner" && !dependencies.backgroundSyncEnabled
          ? (await syncAvatarAgent(dependencies, userId, avatar, { force: false })).providerAgentId
          : getUsableProviderAgentId(avatar, access.type);
      const { conversation, realtimeSession, expiresAt } = await reserveVoiceSession(
        dependencies,
        userId,
        avatar.id,
        access.type === "shared"
          ? {
              id: access.accessGrant.id,
              participantEmail: access.accessGrant.participantEmail,
            }
          : null,
        ip
      );

      let createdProviderSessionToken: string | null = null;
      let createdProviderSessionTokenCiphertext: string | null = null;
      try {
        const liveAvatarSession = await dependencies.liveAvatarProvider.createLiteSessionToken({
          avatarId: liveAvatarConfig.avatarId,
          elevenLabsAgentId: providerAgentId,
        });
        createdProviderSessionToken = liveAvatarSession.sessionToken;
        createdProviderSessionTokenCiphertext =
          access.type === "shared" && dependencies.externalSessions
            ? dependencies.externalSessions.providerTokenProtector.encrypt(liveAvatarSession.sessionToken)
            : null;
        const activeSession = await dependencies.realtimeSessionsRepository.markActive(
          realtimeSession.id,
          liveAvatarSession.sessionId ?? undefined,
          createdProviderSessionTokenCiphertext ?? undefined
        );
        if (!activeSession) throw new LiveAvatarSessionTimeoutServiceError();
        if (access.type === "shared" && expiresAt) {
          scheduleSharedExpiry(dependencies, {
            realtimeSessionId: realtimeSession.id,
            conversationId: conversation.id,
            sessionToken: liveAvatarSession.sessionToken,
            delayMs: Math.max(0, expiresAt.getTime() - Date.now()),
          });
        }

        return {
          conversationId: conversation.id,
          realtimeSessionId: activeSession.id,
          sessionToken: liveAvatarSession.sessionToken,
          expiresAt: expiresAt?.toISOString() ?? null,
        };
      } catch (error) {
        let providerTokenForRecovery: string | undefined;
        if (createdProviderSessionToken) {
          const stopped = await stopVoiceProviderSession(
            dependencies,
            realtimeSession.id,
            createdProviderSessionToken
          );
          if (access.type === "shared" && !stopped) {
            providerTokenForRecovery =
              createdProviderSessionTokenCiphertext ??
              encryptSharedProviderTokenForRecovery(
                dependencies,
                createdProviderSessionToken,
                realtimeSession.id
              );
          }
        }
        await markRealtimeSessionErrored(dependencies, realtimeSession.id, providerTokenForRecovery);
        await markConversationEndedAfterStartFailure(dependencies, conversation.id, error);
        logger.error("Live Avatar session creation failed", {
          error: summarizeStructuredError(error),
          avatarId: avatar.id,
          liveAvatarAvatarId: liveAvatarConfig.avatarId,
          providerAgentId,
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

    async endVoiceSession(userId: string, realtimeSessionId: string, input: EndVoiceSessionInput) {
      const parsed = EndVoiceSessionInputSchema.parse(input);
      const realtimeSession = await dependencies.realtimeSessionsRepository.findPrivateForParticipant(
        userId,
        realtimeSessionId
      );

      if (!realtimeSession) {
        throw new NotFoundError("Voice session not found");
      }

      if (realtimeSession.status === "ended") {
        return toVoiceSessionDto(realtimeSession);
      }

      if (!realtimeSession.conversationId) {
        const endedSession = await dependencies.realtimeSessionsRepository.markEnded(realtimeSession.id);
        await stopStoredSharedProviderSession(dependencies, realtimeSession).catch(() => false);
        return toVoiceSessionDto(endedSession);
      }

      const immediateTitleInput = {
        messages: parsed.transcript.map(toConversationTitleMessage),
      };
      const fallbackTitle = fallbackConversationTitle(immediateTitleInput);
      const result = await dependencies.realtimeSessionsRepository.finalizePrivate({
        realtimeSessionId: realtimeSession.id,
        conversationId: realtimeSession.conversationId,
        transcript: parsed.transcript.map(({ role, content }) => ({ role, content })),
        title: fallbackTitle,
      });
      if (!result) throw new NotFoundError("Voice session not found");

      await stopStoredSharedProviderSession(dependencies, realtimeSession).catch(() => false);

      if (result.finalized) {
        const titleInput = await createVoiceConversationTitleInput(
          dependencies,
          userId,
          realtimeSession,
          parsed.transcript
        );
        await updateEndedVoiceConversationTitle(dependencies, realtimeSession, titleInput, fallbackTitle);
      }

      return toVoiceSessionDto(result.session);
    },

    async cleanupExpiredShared(now = new Date()) {
      const external = dependencies.externalSessions;
      if (!external) return 0;
      requireSharedLifecycleCapabilities(dependencies);
      const stopProviders = async () => {
        let sessions = await external.policyRepository.listSharedForProviderStop(
          now,
          EXTERNAL_MAINTENANCE_BATCH_SIZE,
          providerStopCursor
        );
        if (sessions.length === 0 && providerStopCursor) {
          providerStopCursor = undefined;
          sessions = await external.policyRepository.listSharedForProviderStop(
            now,
            EXTERNAL_MAINTENANCE_BATCH_SIZE
          );
        }
        providerStopCursor = sessions.at(-1)?.id;

        await runWithConcurrency(sessions, EXTERNAL_PROVIDER_STOP_CONCURRENCY, async (session) => {
          if (!session.providerSessionTokenCiphertext) return;
          try {
            const token = external.providerTokenProtector.decrypt(session.providerSessionTokenCiphertext);
            await stopVoiceProviderSession(dependencies, session.id, token);
          } catch (error) {
            logger.error("Could not recover shared LiveAvatar session", {
              realtimeSessionId: session.id,
              error: summarizeStructuredError(error),
            });
          }
        });
      };
      const closeExpiredRecords = async () => {
        const cutoff = new Date(now.getTime() - EXTERNAL_SESSION_FINALIZATION_GRACE_MS);
        let afterId: string | undefined;
        let expiredCount = 0;

        for (let batch = 0; batch < EXTERNAL_MAINTENANCE_MAX_BATCHES; batch += 1) {
          const expired = afterId
            ? await external.policyRepository.listExpiredSharedForCleanup(
                cutoff,
                EXTERNAL_MAINTENANCE_BATCH_SIZE,
                afterId
              )
            : await external.policyRepository.listExpiredSharedForCleanup(
                cutoff,
                EXTERNAL_MAINTENANCE_BATCH_SIZE
              );
          if (expired.length === 0) break;

          await runWithConcurrency(expired, EXTERNAL_RECORD_CLEANUP_CONCURRENCY, async (session) => {
            const didExpire = await dependencies.realtimeSessionsRepository
              .expireSharedIfActive(session.id, session.conversationId)
              .catch((error) => {
                logger.error("Could not clean up expired shared session", {
                  realtimeSessionId: session.id,
                  error: summarizeStructuredError(error),
                });
                return false;
              });
            if (didExpire === true) expiredCount += 1;
          });
          afterId = expired.at(-1)?.id;
          if (expired.length < EXTERNAL_MAINTENANCE_BATCH_SIZE) break;
        }

        return expiredCount;
      };

      if (!providerStopRun) {
        providerStopRun = stopProviders()
          .catch((error) =>
            logger.error("Could not list shared LiveAvatar sessions for provider stop", {
              error: summarizeStructuredError(error),
            })
          )
          .then(() => {
            providerStopRun = null;
          });
      }

      return closeExpiredRecords();
    },
  };
}

async function reserveVoiceSession(
  dependencies: VoiceSessionsServiceDependencies,
  userId: string,
  avatarId: string,
  grant: { id: string; participantEmail: string } | null,
  ip: string
) {
  const reserve = async (expiresAt?: Date) => {
    const conversation = await dependencies.conversationsRepository.createPrivateForParticipant({
      ownerId: userId,
      avatarAgentId: avatarId,
      mode: "voice",
      ...(grant ? { accessGrantId: grant.id, participantEmail: grant.participantEmail } : {}),
    });
    const realtimeSession = await dependencies.realtimeSessionsRepository.create({
      avatarAgentId: avatarId,
      conversationId: conversation.id,
      ...(grant ? { accessGrantId: grant.id } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    });
    return { conversation, realtimeSession, expiresAt: expiresAt ?? null };
  };

  const external = dependencies.externalSessions;
  if (!grant) return reserve();
  if (!external) throw new ExternalSessionLifecycleConfigurationError();
  requireSharedLifecycleCapabilities(dependencies);
  enforceSharedRateLimit(external, ip, userId, grant.id, avatarId);
  const reservation = await external.policyService.reserveShared({
    targetId: grant.id,
    avatarId,
    participantUserId: userId,
  });
  if (!reservation) throw new NotFoundError("Avatar not found");
  return reservation;
}

function enforceSharedRateLimit(
  external: NonNullable<VoiceSessionsServiceDependencies["externalSessions"]>,
  ip: string,
  userId: string,
  grantId: string,
  avatarId: string
) {
  const result = external.rateLimiter.consume([
    rule("shared-start-ip-target", [ip, grantId], external.rateLimits.startIpTarget),
    rule("shared-start-participant-target", [userId, grantId], external.rateLimits.startParticipantTarget),
    rule("external-start-avatar", [avatarId], external.rateLimits.startAvatar),
  ]);
  if (!result.allowed) {
    const error = new Error("External session rate limit reached") as Error & {
      retryAfterSeconds: number;
      code: "PLATFORM_RATE_LIMIT";
    };
    error.retryAfterSeconds = result.retryAfterSeconds;
    error.code = "PLATFORM_RATE_LIMIT";
    throw error;
  }
}

function rule(namespace: string, identifiers: string[], limit: number) {
  return { namespace, identifiers, limit, windowMs: 60 * 60_000 };
}

function requireSharedLifecycleCapabilities(dependencies: VoiceSessionsServiceDependencies) {
  if (
    typeof dependencies.liveAvatarProvider.stopSession !== "function" ||
    typeof dependencies.realtimeSessionsRepository.markProviderStopped !== "function" ||
    typeof dependencies.realtimeSessionsRepository.expireSharedIfActive !== "function"
  ) {
    throw new ExternalSessionLifecycleConfigurationError();
  }
}

function scheduleSharedExpiry(
  dependencies: VoiceSessionsServiceDependencies,
  input: { realtimeSessionId: string; conversationId: string; sessionToken: string; delayMs: number }
) {
  const schedule = dependencies.externalSessions?.schedule ?? scheduleUnref;
  schedule(() => {
    void stopAndScheduleSharedExpiration(dependencies, input, schedule).catch((error) =>
      logger.error("Could not schedule shared LiveAvatar expiration", {
        realtimeSessionId: input.realtimeSessionId,
        error: summarizeStructuredError(error),
      })
    );
  }, input.delayMs);
}

async function stopAndScheduleSharedExpiration(
  dependencies: VoiceSessionsServiceDependencies,
  input: { realtimeSessionId: string; conversationId: string; sessionToken: string },
  schedule: (callback: () => void, delayMs: number) => void
) {
  const stopPromise = stopVoiceProviderSession(dependencies, input.realtimeSessionId, input.sessionToken);
  schedule(() => {
    void expireSharedSafely(dependencies, input.realtimeSessionId, input.conversationId);
  }, EXTERNAL_SESSION_FINALIZATION_GRACE_MS);
  await stopPromise;
}

async function expireSharedSafely(
  dependencies: VoiceSessionsServiceDependencies,
  realtimeSessionId: string,
  conversationId: string | null
) {
  try {
    await dependencies.realtimeSessionsRepository.expireSharedIfActive(realtimeSessionId, conversationId);
  } catch (error) {
    logger.error("Could not expire shared LiveAvatar session", {
      realtimeSessionId,
      error: summarizeStructuredError(error),
    });
  }
}

async function stopStoredSharedProviderSession(
  dependencies: VoiceSessionsServiceDependencies,
  session: {
    id: string;
    providerSessionTokenCiphertext?: string | null;
    providerStoppedAt?: Date | null;
  }
) {
  const external = dependencies.externalSessions;
  if (!external || !session.providerSessionTokenCiphertext || session.providerStoppedAt) return true;
  try {
    return await stopVoiceProviderSession(
      dependencies,
      session.id,
      external.providerTokenProtector.decrypt(session.providerSessionTokenCiphertext)
    );
  } catch (error) {
    logger.error("Could not decrypt shared LiveAvatar session token", {
      realtimeSessionId: session.id,
      error: summarizeStructuredError(error),
    });
    return false;
  }
}

async function stopVoiceProviderSession(
  dependencies: VoiceSessionsServiceDependencies,
  realtimeSessionId: string,
  sessionToken: string
) {
  try {
    await dependencies.liveAvatarProvider.stopSession(sessionToken);
    await dependencies.realtimeSessionsRepository.markProviderStopped(realtimeSessionId);
    return true;
  } catch (error) {
    logger.error("Could not stop LiveAvatar session", {
      realtimeSessionId,
      error: summarizeStructuredError(error),
    });
    return false;
  }
}

function encryptSharedProviderTokenForRecovery(
  dependencies: VoiceSessionsServiceDependencies,
  sessionToken: string,
  realtimeSessionId: string
) {
  try {
    return dependencies.externalSessions?.providerTokenProtector.encrypt(sessionToken);
  } catch (error) {
    logger.error("Could not encrypt shared LiveAvatar session token for recovery", {
      realtimeSessionId,
      error: summarizeStructuredError(error),
    });
    return undefined;
  }
}

function scheduleUnref(callback: () => void, delayMs: number) {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
}

function getReadySharedProviderAgentId(avatar: AvatarAgentRecord): string {
  const parsedVoiceConfig = VoiceConfigSchema.safeParse(avatar.voiceConfig);

  if (!parsedVoiceConfig.success || !hasUsableAvatarProviderVersion(avatar)) {
    throw new SharedAvatarNotReadyError();
  }

  return avatar.providerAgentId;
}

function getUsableProviderAgentId(avatar: AvatarAgentRecord, accessType: "owner" | "shared") {
  try {
    return getReadySharedProviderAgentId(avatar);
  } catch (error) {
    if (accessType === "shared") throw error;
    throw new VoiceSessionConfigurationError("El avatar todavía está preparando su contexto de voz");
  }
}

function parseSharedLiveAvatarConfig(avatar: AvatarAgentRecord) {
  const parsed = LiveAvatarConfigSchema.safeParse(avatar.liveAvatarConfig);

  if (!parsed.success) {
    throw new SharedAvatarNotReadyError();
  }

  return parsed.data;
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
      providerLastUsableAt: new Date(),
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

async function createVoiceConversationTitleInput(
  dependencies: VoiceSessionsServiceDependencies,
  ownerId: string,
  realtimeSession: { avatarAgentId: string },
  transcript: VoiceSessionTranscriptEntry[]
) {
  const messages = transcript.map(toConversationTitleMessage);

  try {
    const avatar = await dependencies.avatarsRepository.findByIdForOwner(
      ownerId,
      realtimeSession.avatarAgentId
    );
    return {
      ...(avatar?.name ? { avatarName: avatar.name } : {}),
      messages,
    };
  } catch (error) {
    logger.error("Failed to prepare voice conversation title", {
      error: summarizeStructuredError(error),
      avatarAgentId: realtimeSession.avatarAgentId,
    });
    return { messages };
  }
}

async function updateEndedVoiceConversationTitle(
  dependencies: VoiceSessionsServiceDependencies,
  realtimeSession: { conversationId: string | null; avatarAgentId: string },
  titleInput: { avatarName?: string; messages: ConversationTitleMessage[] },
  currentTitle?: string
) {
  if (!realtimeSession.conversationId) return;

  try {
    const generatedTitle = await generateConversationTitle(
      dependencies.conversationTitleGenerator,
      titleInput
    );
    const title = generatedTitle ?? currentTitle ?? fallbackConversationTitle(titleInput);
    if (title !== currentTitle) {
      await dependencies.conversationsRepository.updateTitle(realtimeSession.conversationId, title);
    }
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
  status: string;
  endedAt: Date | null;
}) {
  return {
    id: session.id,
    conversationId: session.conversationId,
    status: session.status,
    endedAt: session.endedAt?.toISOString() ?? null,
  };
}

async function markRealtimeSessionErrored(
  dependencies: VoiceSessionsServiceDependencies,
  realtimeSessionId: string,
  providerSessionTokenCiphertext?: string
) {
  try {
    await dependencies.realtimeSessionsRepository.markErrored(
      realtimeSessionId,
      EXTERNAL_SESSION_START_ERROR_MESSAGE,
      providerSessionTokenCiphertext
    );
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
