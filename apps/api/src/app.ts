import { Hono } from "hono";
import { cors } from "hono/cors";
import { clientEnv, appConfig, liveAvatarConfig } from "@yuni/config";
import { LiveAvatarProvider } from "@yuni/avatars";
import {
  createConversationRepository,
  createMessageRepository,
  createRealtimeSessionRepository,
  prisma,
} from "@yuni/db";
import { ElevenLabsAgentProvider } from "@yuni/voice";
import { createLogger } from "@yuni/observability";
import { createAuthController, type AuthControllerDependencies } from "./domains/auth/controller.js";
import { passwordService } from "./domains/auth/password.js";
import { createAuthRepository } from "./domains/auth/repository.js";
import { createAvatarsController, type AvatarsControllerDependencies } from "./domains/avatars/controller.js";
import { createAvatarsRepository } from "./domains/avatars/repository.js";
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
import { requestLogger } from "./middleware/request-logger.js";
import { internalServerError } from "./utils/errors.js";

export type AppDependencies = {
  auth: AuthControllerDependencies;
  avatars: AvatarsControllerDependencies;
  liveAvatar: LiveAvatarControllerDependencies;
  voiceSessions: VoiceSessionsControllerDependencies;
  voiceProviders?: VoiceProvidersControllerDependencies;
};

const liveAvatarProvider = new LiveAvatarProvider();
const elevenLabsAgentProvider = new ElevenLabsAgentProvider();

const defaultDependencies: AppDependencies = {
  auth: {
    repository: createAuthRepository(prisma),
    passwords: passwordService,
  },
  avatars: {
    repository: createAvatarsRepository(prisma),
    liveAvatarConfig,
    avatarProvider: liveAvatarProvider,
    elevenLabsVoiceProvider: elevenLabsAgentProvider,
    elevenLabsAgentProvider,
  },
  liveAvatar: {
    provider: liveAvatarProvider,
  },
  voiceSessions: {
    avatarsRepository: createAvatarsRepository(prisma),
    conversationsRepository: createConversationRepository(prisma),
    realtimeSessionsRepository: createRealtimeSessionRepository(prisma),
    messagesRepository: createMessageRepository(prisma),
    liveAvatarProvider,
    elevenLabsAgentProvider,
  },
  voiceProviders: {
    elevenLabsVoiceProvider: elevenLabsAgentProvider,
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
      allowHeaders: ["Content-Type"],
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
  app.route("/", createLiveAvatarController(dependencies.liveAvatar));
  app.route("/", createVoiceSessionsController(dependencies.voiceSessions));

  if (dependencies.voiceProviders) {
    app.route("/", createVoiceProvidersController(dependencies.voiceProviders));
  }

  return app;
}

export const app = createApp();
