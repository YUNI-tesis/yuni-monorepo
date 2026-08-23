import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  clientEnv,
  appConfig,
  authConfig,
  liveAvatarConfig,
  rateLimitConfig,
  hasS3Config,
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
import { requestLogger } from "./middleware/request-logger.js";
import { internalServerError } from "./utils/errors.js";
import {
  createPublicSessionsController,
  type PublicSessionsControllerDependencies,
} from "./domains/public-sessions/controller.js";
import { createPublicTokenService } from "./domains/public-sessions/tokens.js";
import { createInMemoryPublicSessionRateLimiter } from "./domains/public-sessions/rate-limiter.js";
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
const publicSessionRateLimiter = createInMemoryPublicSessionRateLimiter({
  maxPerAvatar: rateLimitConfig.maxPublicSessionsPerAvatarPerHour,
  maxPerIpAndLink: rateLimitConfig.maxPublicSessionsPerIpPerHour,
});

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
    messagesRepository: createMessageRepository(prisma),
    liveAvatarProvider,
    elevenLabsAgentProvider,
    conversationTitleGenerator,
    backgroundSyncEnabled: true,
  },
  voiceProviders: {
    elevenLabsVoiceProvider: elevenLabsAgentProvider,
  },
  share: {
    repository: createShareLinksRepository(prisma),
    publicBaseUrl: clientEnv.NEXT_PUBLIC_WEB_URL,
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
    rateLimiter: publicSessionRateLimiter,
    publicSessionMaxMinutes: rateLimitConfig.publicSessionMaxMinutes,
    publicSessionMaxMessages: rateLimitConfig.publicSessionMaxMessages,
    providerTokenProtector: createProviderTokenProtector(authConfig.secret),
    conversationTitleGenerator,
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
    providerTokenProtector: createProviderTokenProtector(authConfig.secret),
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
        stack: error.stack,
      },
      method: context.req.method,
      path: context.req.path,
    });

    return context.json(internalServerError(), 500);
  });

  app.use("*", requestLogger());

  app.use(
    "*",
    cors({
      origin: clientEnv.NEXT_PUBLIC_WEB_URL,
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
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

export function startPublicSessionMaintenance(intervalMs = 15_000) {
  const dependencies = defaultDependencies.publicSessions;
  if (!dependencies) return () => undefined;
  const service = createPublicSessionsService(dependencies);
  let running = false;
  const cleanup = async () => {
    if (running) return;
    running = true;
    try {
      await service.cleanupExpired();
    } catch (error) {
      logger.error("Public session maintenance failed", {
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
