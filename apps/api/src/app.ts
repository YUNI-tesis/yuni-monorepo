import { Hono } from "hono";
import { cors } from "hono/cors";
import { clientEnv, appConfig, liveAvatarConfig } from "@yuni/config";
import { LiveAvatarProvider } from "@yuni/avatars";
import { prisma } from "@yuni/db";
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
import { requestLogger } from "./middleware/request-logger.js";
import { internalServerError } from "./utils/errors.js";

export type AppDependencies = {
  auth: AuthControllerDependencies;
  avatars: AvatarsControllerDependencies;
  liveAvatar: LiveAvatarControllerDependencies;
};

const defaultDependencies: AppDependencies = {
  auth: {
    repository: createAuthRepository(prisma),
    passwords: passwordService,
  },
  avatars: {
    repository: createAvatarsRepository(prisma),
    liveAvatarConfig,
  },
  liveAvatar: {
    provider: new LiveAvatarProvider(),
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

  return app;
}

export const app = createApp();
