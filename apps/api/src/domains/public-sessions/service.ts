import {
  EndPublicSessionInputSchema,
  LiveAvatarConfigSchema,
  NotFoundError,
  type EndPublicSessionInput,
  type IdentifyPublicLinkInput,
} from "@yuni/domain";
import {
  AvatarProviderError,
  AvatarProviderTimeoutError,
  AvatarProviderUnavailableError,
  type AvatarProvider,
} from "@yuni/avatars";
import { fallbackConversationTitle, type ConversationTitleGenerator } from "@yuni/ai";
import { createLogger } from "@yuni/observability";
import type { createPublicSessionRepository } from "@yuni/db";
import type { RateLimiter } from "./rate-limiter";
import type { ProviderTokenProtector } from "./provider-token-protector";
import type { PublicTokenService } from "./tokens";
import type { ExternalSessionPolicyService } from "../external-sessions/policy";
import { hasUsableAvatarProviderVersion } from "../avatars/provider-availability";
import {
  EXTERNAL_MAINTENANCE_BATCH_SIZE,
  EXTERNAL_MAINTENANCE_MAX_BATCHES,
  EXTERNAL_PROVIDER_STOP_CONCURRENCY,
  EXTERNAL_RECORD_CLEANUP_CONCURRENCY,
  EXTERNAL_SESSION_FINALIZATION_GRACE_MS,
  EXTERNAL_SESSION_START_ERROR_MESSAGE,
  runWithConcurrency,
} from "../external-sessions/lifecycle";

const logger = createLogger("@yuni/api:public-sessions");

export class InvalidPublicTokenError extends Error {}
export class PublicVoiceUnavailableError extends Error {}
export class PublicSessionRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Public session rate limit reached");
  }
}
export class PublicVoiceProviderError extends Error {
  constructor(readonly kind: "unavailable" | "timeout" | "failed") {
    super("We could not start the public call");
  }
}

type PublicSessionsRepository = ReturnType<typeof createPublicSessionRepository>;

export type PublicSessionsServiceDependencies = {
  repository: PublicSessionsRepository;
  liveAvatarProvider: Pick<AvatarProvider, "createLiteSessionToken" | "stopSession">;
  tokenService: PublicTokenService;
  rateLimiter: RateLimiter;
  policyService: ExternalSessionPolicyService;
  rateLimits: {
    identifyIpLink: number;
    identifyEmailLink: number;
    startIpTarget: number;
    startParticipantTarget: number;
    startLink: number;
    startAvatar: number;
  };
  publicSessionMaxMessages: number;
  providerTokenProtector: ProviderTokenProtector;
  conversationTitleGenerator?: ConversationTitleGenerator;
  schedule?: (callback: () => void, delayMs: number) => void;
};

export function createPublicSessionsService(dependencies: PublicSessionsServiceDependencies) {
  let providerStopCursor: string | undefined;
  let providerStopRun: Promise<void> | null = null;

  return {
    async identify(slug: string, input: IdentifyPublicLinkInput, ip: string) {
      const link = await requirePublicLink(dependencies.repository, slug);
      enforceRateLimit(dependencies, [
        rateRule("public-identify-ip-link", [ip, link.id], dependencies.rateLimits.identifyIpLink, 15),
        rateRule(
          "public-identify-email-link",
          [input.email, link.id],
          dependencies.rateLimits.identifyEmailLink,
          15
        ),
      ]);
      const consentedAt = new Date();
      const identity = await dependencies.tokenService.createIdentityToken({
        slug: link.slug,
        email: input.email,
        consentedAt: consentedAt.toISOString(),
      });

      return {
        email: input.email,
        token: identity.token,
        expiresAt: identity.expiresAt.toISOString(),
      };
    },

    async start(slug: string, identityToken: string, ip: string) {
      const identity = await dependencies.tokenService.verifyIdentityToken(identityToken);
      if (!identity || identity.slug !== slug) throw new InvalidPublicTokenError();

      const link = await requirePublicLink(dependencies.repository, slug);
      const liveAvatar = LiveAvatarConfigSchema.safeParse(link.avatarAgent.liveAvatarConfig);
      if (!liveAvatar.success || !hasUsableAvatarProviderVersion(link.avatarAgent)) {
        throw new PublicVoiceUnavailableError();
      }

      enforceRateLimit(dependencies, [
        rateRule("public-start-ip-target", [ip, link.id], dependencies.rateLimits.startIpTarget, 60),
        rateRule(
          "public-start-participant-target",
          [identity.email, link.id],
          dependencies.rateLimits.startParticipantTarget,
          60
        ),
        rateRule("public-start-link", [link.id], dependencies.rateLimits.startLink, 60),
        rateRule("external-start-avatar", [link.avatarAgentId], dependencies.rateLimits.startAvatar, 60),
      ]);
      const participant = await dependencies.repository.findUserByEmail(identity.email);

      const reservation = await dependencies.policyService.reservePublic({
        targetId: link.id,
        avatarId: link.avatarAgentId,
        participantEmail: identity.email,
        ...(participant ? { participantUserId: participant.id } : {}),
        consentedAt: new Date(identity.consentedAt),
      });
      if (!reservation) throw new NotFoundError("Public resource not found");
      const { expiresAt, ...records } = reservation;

      let providerSessionToken: string | null = null;
      let providerSessionTokenCiphertext: string | null = null;
      try {
        const providerSession = await dependencies.liveAvatarProvider.createLiteSessionToken({
          avatarId: liveAvatar.data.avatarId,
          elevenLabsAgentId: link.avatarAgent.providerAgentId,
        });
        providerSessionToken = providerSession.sessionToken;
        providerSessionTokenCiphertext = dependencies.providerTokenProtector.encrypt(
          providerSession.sessionToken
        );
        const prepared = await dependencies.repository.markPrepared({
          publicSessionId: records.publicSession.id,
          realtimeSessionId: records.realtimeSession.id,
          ...(providerSession.sessionId ? { providerSessionId: providerSession.sessionId } : {}),
          providerSessionTokenCiphertext,
        });
        if (!prepared) throw new PublicVoiceProviderError("timeout");
        const access = await dependencies.tokenService.createSessionToken(
          records.publicSession.id,
          { shareLinkId: link.id },
          Math.max(60, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) + 300
        );
        scheduleExpiry(dependencies, {
          sessionToken: providerSession.sessionToken,
          publicSessionId: records.publicSession.id,
          conversationId: records.conversation.id,
          realtimeSessionId: records.realtimeSession.id,
          delayMs: Math.max(0, expiresAt.getTime() - Date.now()),
        });

        return {
          publicSession: {
            id: records.publicSession.id,
            token: access.token,
            expiresAt: expiresAt.toISOString(),
            maxTranscriptMessages: dependencies.publicSessionMaxMessages,
          },
          voiceSession: {
            conversationId: records.conversation.id,
            realtimeSessionId: records.realtimeSession.id,
            sessionToken: providerSession.sessionToken,
            expiresAt: expiresAt.toISOString(),
          },
        };
      } catch (error) {
        let providerTokenForRecovery: string | undefined;
        if (providerSessionToken) {
          const stopped = await stopProviderSession(dependencies, {
            publicSessionId: records.publicSession.id,
            realtimeSessionId: records.realtimeSession.id,
            sessionToken: providerSessionToken,
          });
          if (!stopped) {
            providerTokenForRecovery =
              providerSessionTokenCiphertext ??
              encryptProviderTokenForRecovery(dependencies, providerSessionToken, records.publicSession.id);
          }
        }
        await dependencies.repository.markStartFailed({
          publicSessionId: records.publicSession.id,
          realtimeSessionId: records.realtimeSession.id,
          conversationId: records.conversation.id,
          errorMessage: EXTERNAL_SESSION_START_ERROR_MESSAGE,
          ...(providerTokenForRecovery ? { providerSessionTokenCiphertext: providerTokenForRecovery } : {}),
        });
        if (error instanceof AvatarProviderUnavailableError) {
          throw new PublicVoiceProviderError("unavailable");
        }
        if (error instanceof AvatarProviderTimeoutError) {
          throw new PublicVoiceProviderError("timeout");
        }
        if (error instanceof AvatarProviderError) {
          throw new PublicVoiceProviderError("failed");
        }
        throw error;
      }
    },

    async confirmStarted(publicSessionId: string, sessionToken: string) {
      const access = await dependencies.tokenService.verifySessionToken(sessionToken);
      if (!access || access.sessionId !== publicSessionId) throw new InvalidPublicTokenError();

      const session = await dependencies.repository.findForStartConfirmation(publicSessionId);
      const realtimeSession = session?.realtimeSessions[0];
      if (
        !session ||
        (session.shareLinkId !== null && session.shareLinkId !== access.shareLinkId) ||
        session.status !== "active" ||
        !session.expiresAt ||
        session.expiresAt.getTime() <= Date.now() ||
        !realtimeSession ||
        !["connecting", "active"].includes(realtimeSession.status)
      ) {
        throw new NotFoundError("Public session not found");
      }

      const started = await dependencies.repository.markStarted({
        publicSessionId,
        realtimeSessionId: realtimeSession.id,
        shareLinkId: access.shareLinkId,
      });
      if (!started) throw new NotFoundError("Public session not found");
      return { id: publicSessionId, status: "active" as const };
    },

    async failStart(publicSessionId: string, sessionToken: string) {
      const access = await dependencies.tokenService.verifySessionToken(sessionToken);
      if (!access || access.sessionId !== publicSessionId) throw new InvalidPublicTokenError();

      const session = await dependencies.repository.findForEnd(publicSessionId);
      if (!session || (session.shareLinkId !== null && session.shareLinkId !== access.shareLinkId)) {
        throw new NotFoundError("Public session not found");
      }
      const conversation = session.conversation;
      const realtimeSession = session.realtimeSessions[0];
      if (!realtimeSession) throw new NotFoundError("Public session not found");

      if (session.status === "ended" && realtimeSession.status === "ended") {
        await stopStoredPublicProviderSession(dependencies, {
          publicSessionId,
          realtimeSessionId: realtimeSession.id,
          providerStoppedAt: realtimeSession.providerStoppedAt,
          providerSessionTokenCiphertext: realtimeSession.providerSessionTokenCiphertext,
        });
        return {
          id: publicSessionId,
          status: "ended" as const,
          endedAt: session.endedAt?.toISOString() ?? null,
        };
      }
      if (session.status === "errored" && realtimeSession.status === "errored") {
        await stopStoredPublicProviderSession(dependencies, {
          publicSessionId,
          realtimeSessionId: realtimeSession.id,
          providerStoppedAt: realtimeSession.providerStoppedAt,
          providerSessionTokenCiphertext: realtimeSession.providerSessionTokenCiphertext,
        });
        return { id: publicSessionId, status: "errored" as const };
      }
      if (!conversation) throw new NotFoundError("Public session not found");
      if (session.status !== "active" || !["connecting", "active"].includes(realtimeSession.status)) {
        throw new NotFoundError("Public session not found");
      }

      const failed = await dependencies.repository.markStartFailed({
        publicSessionId,
        realtimeSessionId: realtimeSession.id,
        conversationId: conversation.id,
        errorMessage: EXTERNAL_SESSION_START_ERROR_MESSAGE,
      });
      if (!failed) {
        const current = await dependencies.repository.findForEnd(publicSessionId);
        const currentRealtimeSession = current?.realtimeSessions[0];
        if (
          current?.status === "ended" &&
          currentRealtimeSession?.id === realtimeSession.id &&
          currentRealtimeSession.status === "ended"
        ) {
          await stopStoredPublicProviderSession(dependencies, {
            publicSessionId,
            realtimeSessionId: currentRealtimeSession.id,
            providerStoppedAt: currentRealtimeSession.providerStoppedAt,
            providerSessionTokenCiphertext: currentRealtimeSession.providerSessionTokenCiphertext,
          });
          return {
            id: publicSessionId,
            status: "ended" as const,
            endedAt: current.endedAt?.toISOString() ?? null,
          };
        }
        if (
          current?.status !== "errored" ||
          currentRealtimeSession?.id !== realtimeSession.id ||
          currentRealtimeSession.status !== "errored"
        ) {
          throw new NotFoundError("Public session not found");
        }
      }

      await stopStoredPublicProviderSession(dependencies, {
        publicSessionId,
        realtimeSessionId: realtimeSession.id,
        providerStoppedAt: realtimeSession.providerStoppedAt,
        providerSessionTokenCiphertext: realtimeSession.providerSessionTokenCiphertext,
      });
      return { id: publicSessionId, status: "errored" as const };
    },

    async end(publicSessionId: string, sessionToken: string, input: EndPublicSessionInput) {
      const access = await dependencies.tokenService.verifySessionToken(sessionToken);
      if (!access || access.sessionId !== publicSessionId) throw new InvalidPublicTokenError();

      const session = await dependencies.repository.findForEnd(publicSessionId);
      if (!session || (session.shareLinkId !== null && session.shareLinkId !== access.shareLinkId)) {
        throw new NotFoundError("Public session not found");
      }
      if (session.status === "ended") {
        return { id: session.id, status: session.status, endedAt: session.endedAt?.toISOString() ?? null };
      }
      if (session.status === "blocked" || session.status === "errored") {
        throw new NotFoundError("Public session not found");
      }
      const conversation = session.conversation;
      const realtimeSession = session.realtimeSessions[0];
      if (!conversation || !realtimeSession) throw new NotFoundError("Public session not found");

      const parsed = EndPublicSessionInputSchema.parse(input);
      const transcript = parsed.transcript.slice(0, dependencies.publicSessionMaxMessages);
      const titleInput = {
        avatarName: session.avatarAgent.name,
        messages: transcript.map(({ role, content }) => ({ role, content })),
      };
      const result = await dependencies.repository.finalize({
        publicSessionId,
        conversationId: conversation.id,
        realtimeSessionId: realtimeSession.id,
        transcript: transcript.map(({ role, content }) => ({ role, content })),
        title: fallbackConversationTitle(titleInput),
      });
      if (!result) throw new NotFoundError("Public session not found");

      await stopStoredPublicProviderSession(dependencies, {
        publicSessionId,
        realtimeSessionId: realtimeSession.id,
        providerStoppedAt: realtimeSession.providerStoppedAt,
        providerSessionTokenCiphertext: realtimeSession.providerSessionTokenCiphertext,
      });

      if (result.finalized) {
        const title = await generateTitle(dependencies.conversationTitleGenerator, titleInput);
        if (title) {
          await dependencies.repository
            .updateConversationTitleIfEnded(conversation.id, title)
            .catch((error) =>
              logger.error("Could not update public conversation title", {
                conversationId: conversation.id,
                error: summarizeProviderError(error),
              })
            );
        }
      }
      return {
        id: result.session.id,
        status: result.session.status,
        endedAt: result.session.endedAt?.toISOString() ?? null,
      };
    },

    async cleanupExpired(now = new Date()) {
      const stopProviders = async () => {
        let providerSessions = await dependencies.repository.listExpiredForProviderStop(
          now,
          EXTERNAL_MAINTENANCE_BATCH_SIZE,
          providerStopCursor
        );
        if (providerSessions.length === 0 && providerStopCursor) {
          providerStopCursor = undefined;
          providerSessions = await dependencies.repository.listExpiredForProviderStop(
            now,
            EXTERNAL_MAINTENANCE_BATCH_SIZE
          );
        }
        providerStopCursor = providerSessions.at(-1)?.publicSessionId;

        await runWithConcurrency(providerSessions, EXTERNAL_PROVIDER_STOP_CONCURRENCY, async (session) => {
          try {
            const token = dependencies.providerTokenProtector.decrypt(session.providerSessionTokenCiphertext);
            await stopProviderSession(dependencies, {
              publicSessionId: session.publicSessionId,
              realtimeSessionId: session.realtimeSessionId,
              sessionToken: token,
            });
          } catch (error) {
            logger.error("Could not decrypt public LiveAvatar session token", {
              publicSessionId: session.publicSessionId,
              error: summarizeProviderError(error),
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
            ? await dependencies.repository.listExpiredForCleanup(
                cutoff,
                EXTERNAL_MAINTENANCE_BATCH_SIZE,
                afterId
              )
            : await dependencies.repository.listExpiredForCleanup(cutoff, EXTERNAL_MAINTENANCE_BATCH_SIZE);
          if (expired.length === 0) break;

          await runWithConcurrency(expired, EXTERNAL_RECORD_CLEANUP_CONCURRENCY, async (session) => {
            const didExpire = await dependencies.repository.expireIfActive(session).catch((error) => {
              logger.error("Could not clean up expired public session", {
                publicSessionId: session.publicSessionId,
                error: summarizeProviderError(error),
              });
              return false;
            });
            if (didExpire) expiredCount += 1;
          });
          afterId = expired.at(-1)?.publicSessionId;
          if (expired.length < EXTERNAL_MAINTENANCE_BATCH_SIZE) break;
        }

        return expiredCount;
      };

      if (!providerStopRun) {
        providerStopRun = stopProviders()
          .catch((error) =>
            logger.error("Could not list public LiveAvatar sessions for provider stop", {
              error: summarizeProviderError(error),
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

function rateRule(namespace: string, identifiers: string[], limit: number, windowMinutes: number) {
  return { namespace, identifiers, limit, windowMs: windowMinutes * 60_000 };
}

function enforceRateLimit(
  dependencies: Pick<PublicSessionsServiceDependencies, "rateLimiter">,
  rules: Parameters<RateLimiter["consume"]>[0]
) {
  const result = dependencies.rateLimiter.consume(rules);
  if (!result.allowed) throw new PublicSessionRateLimitedError(result.retryAfterSeconds);
}

function scheduleExpiry(
  dependencies: PublicSessionsServiceDependencies,
  input: {
    sessionToken: string;
    publicSessionId: string;
    conversationId: string;
    realtimeSessionId: string;
    delayMs: number;
  }
) {
  const schedule = dependencies.schedule ?? scheduleUnref;
  schedule(() => {
    void stopProviderSession(dependencies, input).catch((error) =>
      logger.error("Could not stop expired public LiveAvatar session", {
        publicSessionId: input.publicSessionId,
        error: summarizeProviderError(error),
      })
    );
    schedule(() => {
      void dependencies.repository
        .expireIfActive({
          publicSessionId: input.publicSessionId,
          conversationId: input.conversationId,
          realtimeSessionId: input.realtimeSessionId,
        })
        .catch((error) =>
          logger.error("Could not clean up expired public session", {
            publicSessionId: input.publicSessionId,
            error: summarizeProviderError(error),
          })
        );
    }, EXTERNAL_SESSION_FINALIZATION_GRACE_MS);
  }, input.delayMs);
}

async function stopProviderSession(
  dependencies: PublicSessionsServiceDependencies,
  input: { publicSessionId: string; realtimeSessionId: string; sessionToken: string }
) {
  try {
    await dependencies.liveAvatarProvider.stopSession(input.sessionToken);
    await dependencies.repository.markProviderStopped(input.realtimeSessionId);
    return true;
  } catch (error) {
    logger.error("Could not stop public LiveAvatar session", {
      publicSessionId: input.publicSessionId,
      error: summarizeProviderError(error),
    });
    return false;
  }
}

async function stopStoredPublicProviderSession(
  dependencies: PublicSessionsServiceDependencies,
  input: {
    publicSessionId: string;
    realtimeSessionId: string;
    providerStoppedAt: Date | null;
    providerSessionTokenCiphertext: string | null;
  }
) {
  if (input.providerStoppedAt || !input.providerSessionTokenCiphertext) return true;

  try {
    return await stopProviderSession(dependencies, {
      publicSessionId: input.publicSessionId,
      realtimeSessionId: input.realtimeSessionId,
      sessionToken: dependencies.providerTokenProtector.decrypt(input.providerSessionTokenCiphertext),
    });
  } catch (error) {
    logger.error("Could not decrypt public LiveAvatar session token", {
      publicSessionId: input.publicSessionId,
      error: summarizeProviderError(error),
    });
    return false;
  }
}

function encryptProviderTokenForRecovery(
  dependencies: Pick<PublicSessionsServiceDependencies, "providerTokenProtector">,
  sessionToken: string,
  publicSessionId: string
) {
  try {
    return dependencies.providerTokenProtector.encrypt(sessionToken);
  } catch (error) {
    logger.error("Could not encrypt public LiveAvatar session token for recovery", {
      publicSessionId,
      error: summarizeProviderError(error),
    });
    return undefined;
  }
}

function scheduleUnref(callback: () => void, delayMs: number) {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
}

async function requirePublicLink(repository: PublicSessionsRepository, slug: string) {
  const link = await repository.resolveEnabledLink(slug);
  if (!link) throw new NotFoundError("Public avatar not found");
  return link;
}

async function generateTitle(
  generator: ConversationTitleGenerator | undefined,
  input: { avatarName: string; messages: Array<{ role: "user" | "assistant"; content: string }> }
) {
  try {
    return (await generator?.generateTitle(input)) ?? null;
  } catch (error) {
    logger.error("Public conversation title generation failed", { error: summarizeProviderError(error) });
    return null;
  }
}

function summarizeProviderError(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : "Unknown provider error";
}
