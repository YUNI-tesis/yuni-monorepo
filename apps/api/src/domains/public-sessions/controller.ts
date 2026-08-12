import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  EndPublicSessionInputSchema,
  IdentifyPublicLinkInputSchema,
  NotFoundError,
  PUBLIC_SESSION_END_BODY_MAX_BYTES,
} from "@yuni/domain";
import {
  badGatewayError,
  notFoundError,
  rateLimitedError,
  serviceUnavailableError,
  unauthorizedError,
  validationError,
} from "../../utils/errors";
import {
  createPublicSessionsService,
  InvalidPublicTokenError,
  PublicSessionRateLimitedError,
  PublicVoiceProviderError,
  PublicVoiceUnavailableError,
  type PublicSessionsServiceDependencies,
} from "./service";

export type PublicSessionsControllerDependencies = PublicSessionsServiceDependencies;

export function createPublicSessionsController(dependencies: PublicSessionsControllerDependencies) {
  const controller = new Hono();
  const service = createPublicSessionsService(dependencies);

  controller.post("/public/links/:slug/identify", async (context) => {
    const parsed = IdentifyPublicLinkInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json({ identity: await service.identify(context.req.param("slug"), parsed.data) });
    } catch (error) {
      return handleError(context, error);
    }
  });

  controller.post("/public/links/:slug/sessions", async (context) => {
    const token = readBearerToken(context);
    if (!token) return context.json(unauthorizedError(), 401);
    try {
      return context.json(await service.start(context.req.param("slug"), token, readClientIp(context)), 201);
    } catch (error) {
      return handleError(context, error);
    }
  });

  controller.post("/public/sessions/:publicSessionId/started", async (context) => {
    const token = readBearerToken(context);
    if (!token) return context.json(unauthorizedError(), 401);
    try {
      return context.json({
        publicSession: await service.confirmStarted(context.req.param("publicSessionId"), token),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });

  controller.post(
    "/public/sessions/:publicSessionId/end",
    bodyLimit({
      maxSize: PUBLIC_SESSION_END_BODY_MAX_BYTES,
      onError: (context) =>
        context.json(validationError([], "El transcript supera el tamaño permitido."), 413),
    }),
    async (context) => {
      const token = readBearerToken(context);
      if (!token) return context.json(unauthorizedError(), 401);
      const parsed = EndPublicSessionInputSchema.safeParse(await context.req.json().catch(() => ({})));
      if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
      try {
        return context.json({
          publicSession: await service.end(context.req.param("publicSessionId"), token, parsed.data),
        });
      } catch (error) {
        return handleError(context, error);
      }
    }
  );

  return controller;
}

function readBearerToken(context: Context) {
  const authorization = context.req.header("Authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

function readClientIp(context: Context) {
  return context.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

function handleError(context: Context, error: unknown) {
  if (error instanceof InvalidPublicTokenError) return context.json(unauthorizedError(), 401);
  if (error instanceof NotFoundError) return context.json(notFoundError("Public resource not found"), 404);
  if (error instanceof PublicSessionRateLimitedError) {
    context.header("Retry-After", String(error.retryAfterSeconds));
    return context.json(rateLimitedError("Alcanzaste el límite temporal de llamadas."), 429);
  }
  if (error instanceof PublicVoiceUnavailableError) {
    return context.json(serviceUnavailableError("Este avatar no está disponible para llamadas."), 503);
  }
  if (error instanceof PublicVoiceProviderError) {
    return error.kind === "unavailable"
      ? context.json(serviceUnavailableError("La llamada no está disponible temporalmente."), 503)
      : context.json(badGatewayError("No pudimos iniciar la llamada."), 502);
  }
  throw error;
}
