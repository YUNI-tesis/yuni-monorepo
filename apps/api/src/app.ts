import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  clientEnv,
  appConfig,
  authConfig,
  liveAvatarConfig,
  rateLimitConfig,
  hasS3Config,
  serverConfig,
} from "@yuni/config";
import { LiveAvatarProvider } from "@yuni/avatars";
import {
  createAccessGrantRepository,
  createConversationRepository,
  createMessageRepository,
  createPublicSessionRepository,
  createRealtimeSessionRepository,
  createJobRepository,
  createAvatarGroupRepository,
  createExternalSessionPolicyRepository,
  prisma,
} from "@yuni/db";
import { S3ObjectStorage } from "@yuni/storage";
import { ElevenLabsAgentProvider } from "@yuni/voice";
import { createOpenAiConversationTitleGenerator, createOpenAiGroupOrchestrator } from "@yuni/ai";
import { createLogger } from "@yuni/observability";
import { createAuthController, type AuthControllerDependencies } from "./domains/auth/controller.js";
import { passwordService } from "./domains/auth/password.js";
import { createAuthRepository } from "./domains/auth/repository.js";
import { createAvatarsController, type AvatarsControllerDependencies } from "./domains/avatars/controller.js";
import { createAvatarsRepository } from "./domains/avatars/repository.js";
import {
  createConversationsController,
  type ConversationsControllerDependencies,
} from "./domains/conversations/controller.js";
import {
  createLiveAvatarController,
  type LiveAvatarControllerDependencies,
} from "./domains/live-avatar/controller.js";
import {
  createVoiceSessionsController,
  type VoiceSessionsControllerDependencies,
} from "./domains/voice-sessions/controller.js";
import { createVoiceSessionsService } from "./domains/voice-sessions/service.js";
import {
  createVoiceProvidersController,
  type VoiceProvidersControllerDependencies,
} from "./domains/voice-providers/controller.js";
import {
  createShareLinksController,
  type ShareLinksControllerDependencies,
} from "./domains/share/controller.js";
import { createShareLinksRepository } from "./domains/share/repository.js";
import {
  createAccessGrantsController,
  type AccessGrantsControllerDependencies,
} from "./domains/share/access-grant-controller.js";
import { createAccessGrantsRepository } from "./domains/share/access-grant-repository.js";
import {
  createAvatarActivityController,
  type AvatarActivityControllerDependencies,
} from "./domains/activity/controller.js";
import { createAvatarActivityDataRepository } from "./domains/activity/repository.js";
import {
  createCreatorDashboardController,
  type CreatorDashboardControllerDependencies,
} from "./domains/dashboard/controller.js";
import { createCreatorDashboardDataRepository } from "./domains/dashboard/repository.js";
import { requestLogger, shouldIncludeErrorStack } from "./middleware/request-logger.js";
import { forbiddenError, internalServerError } from "./utils/errors.js";
import {
  createPublicSessionsController,
  type PublicSessionsControllerDependencies,
} from "./domains/public-sessions/controller.js";
import { createPublicTokenService } from "./domains/public-sessions/tokens.js";
import { createInMemoryRateLimiter } from "./domains/public-sessions/rate-limiter.js";
import { createProviderTokenProtector } from "./domains/public-sessions/provider-token-protector.js";
import { createPublicSessionsService } from "./domains/public-sessions/service.js";
import {
  createAvatarContextController,
  type AvatarContextControllerDependencies,
} from "./domains/context/controller.js";
import { createAvatarContextRepository } from "./domains/context/repository.js";
import {
  createAvatarGroupsController,
  type AvatarGroupsControllerDependencies,
} from "./domains/avatar-groups/controller.js";
import { createAvatarGroupsService } from "./domains/avatar-groups/service.js";
import { createExternalSessionPolicyService } from "./domains/external-sessions/policy.js";
import { createClientIpResolver } from "./middleware/client-ip.js";

export type AppDependencies = {
  auth: AuthControllerDependencies;
  avatars: AvatarsControllerDependencies;
  conversations?: ConversationsControllerDependencies;
  liveAvatar: LiveAvatarControllerDependencies;
  voiceSessions?: VoiceSessionsControllerDependencies;
  voiceProviders?: VoiceProvidersControllerDependencies;
  share?: ShareLinksControllerDependencies;
  accessGrants?: AccessGrantsControllerDependencies;
  activity?: AvatarActivityControllerDependencies;
  dashboard?: CreatorDashboardControllerDependencies;
  publicSessions?: PublicSessionsControllerDependencies;
  context?: AvatarContextControllerDependencies;
  avatarGroups?: AvatarGroupsControllerDependencies;
};

const liveAvatarProvider = new LiveAvatarProvider();
const elevenLabsAgentProvider = new ElevenLabsAgentProvider();
const conversationTitleGenerator = createOpenAiConversationTitleGenerator();
const groupOrchestrator = createOpenAiGroupOrchestrator();
const externalSessionRateLimiter = createInMemoryRateLimiter({ secret: authConfig.secret });
const externalSessionPolicyRepository = createExternalSessionPolicyRepository(prisma);
const externalSessionPolicyService = createExternalSessionPolicyService({
  repository: externalSessionPolicyRepository,
  hardMaxMinutes: rateLimitConfig.maxExternalSessionMinutes,
  maxConcurrentPerParticipant: rateLimitConfig.maxExternalConcurrentPerParticipant,
  maxConcurrentPerAvatar: rateLimitConfig.maxExternalConcurrentPerAvatar,
});
const providerTokenProtector = createProviderTokenProtector(authConfig.secret);
const resolveClientIp = createClientIpResolver(serverConfig.trustProxyHops);
const allowedWebOrigin = normalizeBrowserOrigin(clientEnv.NEXT_PUBLIC_WEB_URL);

const defaultDependencies: AppDependencies = {
  auth: {
    repository: createAuthRepository(prisma),
    passwords: passwordService,
    accessGrantLinker: createAccessGrantRepository(prisma),
  },
  avatars: {
    repository: createAvatarsRepository(prisma),
    liveAvatarConfig,
    avatarProvider: liveAvatarProvider,
    elevenLabsVoiceProvider: elevenLabsAgentProvider,
    elevenLabsAgentProvider,
    jobs: createJobRepository(prisma),
  },
  liveAvatar: {
    provider: liveAvatarProvider,
  },
  conversations: {
    avatarsRepository: createAvatarsRepository(prisma),
    conversationsRepository: createConversationRepository(prisma),
  },
  voiceSessions: {
    avatarsRepository: createAvatarsRepository(prisma),
    conversationsRepository: createConversationRepository(prisma),
    realtimeSessionsRepository: createRealtimeSessionRepository(prisma),
    liveAvatarProvider,
    elevenLabsAgentProvider,
    conversationTitleGenerator,
    backgroundSyncEnabled: true,
    resolveClientIp,
    externalSessions: {
      policyService: externalSessionPolicyService,
      policyRepository: externalSessionPolicyRepository,
      rateLimiter: externalSessionRateLimiter,
      providerTokenProtector,
      rateLimits: {
        startIpTarget: rateLimitConfig.maxExternalSessionStartsPerIpTargetHour,
        startParticipantTarget: rateLimitConfig.maxExternalSessionStartsPerParticipantTargetHour,
        startAvatar: rateLimitConfig.maxExternalSessionStartsPerAvatarHour,
      },
    },
  },
  voiceProviders: {
    elevenLabsVoiceProvider: elevenLabsAgentProvider,
  },
  share: {
    repository: createShareLinksRepository(prisma),
    publicBaseUrl: allowedWebOrigin,
  },
  accessGrants: {
    repository: createAccessGrantsRepository(prisma),
  },
  activity: {
    repository: createAvatarActivityDataRepository(prisma),
  },
  dashboard: {
    repository: createCreatorDashboardDataRepository(prisma),
  },
  publicSessions: {
    repository: createPublicSessionRepository(prisma),
    liveAvatarProvider,
    tokenService: createPublicTokenService(),
    rateLimiter: externalSessionRateLimiter,
    policyService: externalSessionPolicyService,
    rateLimits: {
      identifyIpLink: rateLimitConfig.maxPublicIdentificationsPerIpLink15Minutes,
      identifyEmailLink: rateLimitConfig.maxPublicIdentificationsPerEmailLink15Minutes,
      startIpTarget: rateLimitConfig.maxExternalSessionStartsPerIpTargetHour,
      startParticipantTarget: rateLimitConfig.maxExternalSessionStartsPerParticipantTargetHour,
      startLink: rateLimitConfig.maxPublicSessionStartsPerLinkHour,
      startAvatar: rateLimitConfig.maxExternalSessionStartsPerAvatarHour,
    },
    publicSessionMaxMessages: rateLimitConfig.publicSessionMaxMessages,
    providerTokenProtector,
    conversationTitleGenerator,
    resolveClientIp,
  },
  context: {
    repository: createAvatarContextRepository(prisma),
    ...(hasS3Config() ? { storage: new S3ObjectStorage() } : {}),
  },
  avatarGroups: {
    repository: createAvatarGroupRepository(prisma),
    messagesRepository: createMessageRepository(prisma),
    liveAvatarProvider,
    elevenLabsAgentProvider,
    orchestrator: groupOrchestrator,
    providerTokenProtector,
    maxMinutes: 10,
  },
};

const logger = createLogger("@yuni/api");

export function createApp(dependencies: AppDependencies = defaultDependencies) {
  const app = new Hono();

  app.onError((error, context) => {
    logger.error("unhandled request error", {
      error: {
        name: error.name,
        message: error.message,
        ...(shouldIncludeErrorStack() ? { stack: error.stack } : {}),
      },
      method: context.req.method,
      path: context.req.path,
    });

    return context.json(internalServerError(), 500);
  });

  app.use("*", requestLogger());

  app.use("*", async (context, next) => {
    const origin = context.req.header("origin");
    if (origin && origin !== allowedWebOrigin) {
      return context.json(forbiddenError("Origin not allowed"), 403);
    }
    await next();
  });

  app.use(
    "*",
    cors({
      origin: allowedWebOrigin,
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    })
  );

  app.get("/health", (context) => context.json({ ok: true, service: "@yuni/api" }));

  app.get("/version", (context) =>
    context.json({
      name: appConfig.appName,
      service: "@yuni/api",
      version: "0.1.0",
    })
  );

  app.route("/", createAuthController(dependencies.auth));
  app.route("/", createAvatarsController(dependencies.avatars));
  if (dependencies.conversations) {
    app.route("/", createConversationsController(dependencies.conversations));
  }
  app.route("/", createLiveAvatarController(dependencies.liveAvatar));
  if (dependencies.voiceSessions) {
    app.route("/", createVoiceSessionsController(dependencies.voiceSessions));
  }

  if (dependencies.voiceProviders) {
    app.route("/", createVoiceProvidersController(dependencies.voiceProviders));
  }
  if (dependencies.share) {
    app.route("/", createShareLinksController(dependencies.share));
  }
  if (dependencies.accessGrants) {
    app.route("/", createAccessGrantsController(dependencies.accessGrants));
  }
  if (dependencies.activity) {
    app.route("/", createAvatarActivityController(dependencies.activity));
  }
  if (dependencies.dashboard) {
    app.route("/", createCreatorDashboardController(dependencies.dashboard));
  }
  if (dependencies.publicSessions) {
    app.route("/", createPublicSessionsController(dependencies.publicSessions));
  }
  if (dependencies.context) {
    app.route("/", createAvatarContextController(dependencies.context));
  }
  if (dependencies.avatarGroups) {
    app.route("/", createAvatarGroupsController(dependencies.avatarGroups));
  }

  return app;
}

export const app = createApp();

export function normalizeBrowserOrigin(value: string) {
  return new URL(value).origin;
}

export function startExternalSessionMaintenance(intervalMs = 15_000) {
  const publicDependencies = defaultDependencies.publicSessions;
  const voiceDependencies = defaultDependencies.voiceSessions;
  if (!publicDependencies && !voiceDependencies) return () => undefined;
  const publicService = publicDependencies ? createPublicSessionsService(publicDependencies) : null;
  const voiceService = voiceDependencies ? createVoiceSessionsService(voiceDependencies) : null;
  let running = false;
  const cleanup = async () => {
    if (running) return;
    running = true;
    try {
      await Promise.all([publicService?.cleanupExpired(), voiceService?.cleanupExpiredShared()]);
    } catch (error) {
      logger.error("External session maintenance failed", {
        error: error instanceof Error ? error.message : "Unknown cleanup error",
      });
    } finally {
      running = false;
    }
  };
  void cleanup();
  const timer = setInterval(() => void cleanup(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function startGroupVoiceSessionMaintenance(intervalMs = 15_000) {
  const dependencies = defaultDependencies.avatarGroups;
  if (!dependencies) return () => undefined;
  const service = createAvatarGroupsService(dependencies);
  let running = false;
  const cleanup = async () => {
    if (running) return;
    running = true;
    try {
      await service.cleanupExpired();
    } catch (error) {
      logger.error("Group voice session maintenance failed", {
        error: error instanceof Error ? error.message : "Unknown cleanup error",
      });
    } finally {
      running = false;
    }
  };
  void cleanup();
  const timer = setInterval(() => void cleanup(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
