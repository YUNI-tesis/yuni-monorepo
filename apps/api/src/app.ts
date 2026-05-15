import { Hono } from "hono";
import { cors } from "hono/cors";
import { clientEnv, appConfig } from "@yuni/config";
import { prisma } from "@yuni/db";
import { createLogger } from "@yuni/observability";
import { createAuthController, type AuthControllerDependencies } from "./domains/auth/controller.js";
import { passwordService } from "./domains/auth/password.js";
import { createAuthRepository } from "./domains/auth/repository.js";
import { requestLogger } from "./middleware/request-logger.js";

export type AppDependencies = {
  auth: AuthControllerDependencies;
};

const defaultDependencies: AppDependencies = {
  auth: {
    repository: createAuthRepository(prisma),
    passwords: passwordService,
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

    return context.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      },
      500
    );
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

  return app;
}

export const app = createApp();
