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
import type { PublicSessionRateLimiter } from "./rate-limiter";
import type { ProviderTokenProtector } from "./provider-token-protector";
import type { PublicTokenService } from "./tokens";

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
  liveAvatarProvider: Pick<AvatarProvider, "createLiteSessionToken"> & {
    stopSession(sessionToken: string): Promise<void>;
  };
  tokenService: PublicTokenService;
  rateLimiter: PublicSessionRateLimiter;
  publicSessionMaxMinutes: number;
  publicSessionMaxMessages: number;
  providerTokenProtector: ProviderTokenProtector;
  conversationTitleGenerator?: ConversationTitleGenerator;
  schedule?: (callback: () => void, delayMs: number) => void;
};

export function createPublicSessionsService(dependencies: PublicSessionsServiceDependencies) {
  return {
    async identify(slug: string, input: IdentifyPublicLinkInput) {
      const link = await requirePublicLink(dependencies.repository, slug);
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
      if (
        !liveAvatar.success ||
        !link.avatarAgent.providerAgentId ||
        (link.avatarAgent.providerSyncStatus !== "synced" && !link.avatarAgent.providerLastUsableAt)
      ) {
        throw new PublicVoiceUnavailableError();
      }

      const limit = dependencies.rateLimiter.consume({
        avatarId: link.avatarAgentId,
        shareLinkId: link.id,
        ip,
      });
      if (!limit.allowed) throw new PublicSessionRateLimitedError(limit.retryAfterSeconds);

      const participant = await dependencies.repository.findUserByEmail(identity.email);
      const expiresAt = new Date(Date.now() + dependencies.publicSessionMaxMinutes * 60_000);
      const records = await dependencies.repository.createSession({
        shareLinkId: link.id,
        avatarAgentId: link.avatarAgentId,
        participantEmail: identity.email,
        ...(participant ? { participantUserId: participant.id } : {}),
        consentedAt: new Date(identity.consentedAt),
        expiresAt,
      });

      let providerSessionToken: string | null = null;
      try {
        const providerSession = await dependencies.liveAvatarProvider.createLiteSessionToken({
          avatarId: liveAvatar.data.avatarId,
          elevenLabsAgentId: link.avatarAgent.providerAgentId,
        });
        providerSessionToken = providerSession.sessionToken;
        await dependencies.repository.markPrepared({
          publicSessionId: records.publicSession.id,
          realtimeSessionId: records.realtimeSession.id,
          ...(providerSession.sessionId ? { providerSessionId: providerSession.sessionId } : {}),
          providerSessionTokenCiphertext: dependencies.providerTokenProtector.encrypt(
            providerSession.sessionToken
          ),
        });
        const access = await dependencies.tokenService.createSessionToken(
          records.publicSession.id,
          { shareLinkId: link.id },
          dependencies.publicSessionMaxMinutes * 60 + 300
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
            sessionId: providerSession.sessionId,
          },
        };
      } catch (error) {
        if (providerSessionToken) {
          await stopProviderSession(dependencies, {
            publicSessionId: records.publicSession.id,
            realtimeSessionId: records.realtimeSession.id,
            sessionToken: providerSessionToken,
          });
        }
        await dependencies.repository.markStartFailed({
          publicSessionId: records.publicSession.id,
          realtimeSessionId: records.realtimeSession.id,
          conversationId: records.conversation.id,
          errorMessage: summarizeProviderError(error),
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
        session.shareLinkId !== access.shareLinkId ||
        session.status !== "active" ||
        !session.expiresAt ||
        session.expiresAt.getTime() <= Date.now() ||
        !session.shareLink?.isEnabled ||
        session.avatarAgent.status !== "active" ||
        !realtimeSession ||
        !["connecting", "active"].includes(realtimeSession.status)
      ) {
        throw new NotFoundError("Public session not found");
      }

      await dependencies.repository.markStarted({
        publicSessionId,
        realtimeSessionId: realtimeSession.id,
        shareLinkId: session.shareLink.id,
      });
      return { id: publicSessionId, status: "active" as const };
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

      if (!realtimeSession.providerStoppedAt && realtimeSession.providerSessionTokenCiphertext) {
        try {
          const providerSessionToken = dependencies.providerTokenProtector.decrypt(
            realtimeSession.providerSessionTokenCiphertext
          );
          await stopProviderSession(dependencies, {
            publicSessionId,
            realtimeSessionId: realtimeSession.id,
            sessionToken: providerSessionToken,
          });
        } catch (error) {
          logger.error("Could not decrypt public LiveAvatar session token", {
            publicSessionId,
            error: summarizeProviderError(error),
          });
        }
      }

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
      const providerSessions = await dependencies.repository.listExpiredForProviderStop(now);
      for (const session of providerSessions) {
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
      }

      const expired = await dependencies.repository.listExpiredForCleanup(
        new Date(now.getTime() - EXPIRY_CLEANUP_GRACE_MS)
      );
      for (const session of expired) {
        await dependencies.repository.expireIfActive(session).catch((error) =>
          logger.error("Could not clean up expired public session", {
            publicSessionId: session.publicSessionId,
            error: summarizeProviderError(error),
          })
        );
      }
      return expired.length;
    },
  };
}

const EXPIRY_CLEANUP_GRACE_MS = 30_000;

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
    void stopProviderSession(dependencies, input).finally(() => {
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
      }, EXPIRY_CLEANUP_GRACE_MS);
    });
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
