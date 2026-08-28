import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { EndVoiceSessionInputSchema, NotFoundError, VOICE_SESSION_END_BODY_MAX_BYTES } from "@yuni/domain";
import {
  badGatewayError,
  conflictErrorWithReason,
  notFoundError,
  rateLimitedError,
  serviceUnavailableError,
  validationError,
} from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";
import {
  createVoiceSessionsService,
  ExternalSessionLifecycleConfigurationError,
  LiveAvatarSessionServiceError,
  LiveAvatarSessionTimeoutServiceError,
  SharedAvatarNotReadyError,
  VoiceProviderServiceError,
  VoiceProviderTimeoutServiceError,
  VoiceSessionConfigurationError,
  type VoiceSessionsServiceDependencies,
} from "./service";
import {
  ActiveSessionExistsError,
  ExternalSessionCapacityError,
  ShareSessionCountLimitError,
} from "../external-sessions/policy";

export type VoiceSessionsControllerDependencies = VoiceSessionsServiceDependencies & {
  resolveClientIp?: (context: Context) => string;
};

export function createVoiceSessionsController(dependencies: VoiceSessionsControllerDependencies) {
  const controller = new Hono<CreatorSessionEnv>();
  const service = createVoiceSessionsService(dependencies);

  controller.post("/avatars/:avatarId/agent-provider/sync", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      await service.syncAgentProvider(currentUser.id, context.req.param("avatarId"));

      return context.json({ sync: { status: "ready" as const } });
    } catch (error) {
      return toVoiceSessionError(context, error);
    }
  });

  controller.post("/avatars/:avatarId/voice-sessions", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      const voiceSession = await service.startVoiceSession(
        currentUser.id,
        context.req.param("avatarId"),
        dependencies.resolveClientIp?.(context) ?? "unknown"
      );

      return context.json({ voiceSession }, 201);
    } catch (error) {
      return toVoiceSessionError(context, error);
    }
  });

  controller.post("/voice-sessions/:realtimeSessionId/started", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      const voiceSession = await service.confirmVoiceSessionStarted(
        currentUser.id,
        context.req.param("realtimeSessionId")
      );
      return context.json({ voiceSession });
    } catch (error) {
      return toVoiceSessionError(context, error);
    }
  });

  controller.post("/voice-sessions/:realtimeSessionId/start-failed", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      const voiceSession = await service.failVoiceSessionStart(
        currentUser.id,
        context.req.param("realtimeSessionId")
      );
      return context.json({ voiceSession });
    } catch (error) {
      return toVoiceSessionError(context, error);
    }
  });

  controller.post(
    "/voice-sessions/:realtimeSessionId/end",
    bodyLimit({
      maxSize: VOICE_SESSION_END_BODY_MAX_BYTES,
      onError: (context) =>
        context.json(validationError([], "El transcript supera el tamaño permitido."), 413),
    }),
    async (context) => {
      const currentUser = context.get("currentUser");

      const body: unknown = await context.req.json().catch(() => ({}));
      const parsed = EndVoiceSessionInputSchema.safeParse(body);

      if (!parsed.success) {
        return context.json(validationError(parsed.error.issues), 400);
      }

      try {
        const voiceSession = await service.endVoiceSession(
          currentUser.id,
          context.req.param("realtimeSessionId"),
          parsed.data
        );

        return context.json({ voiceSession });
      } catch (error) {
        return toVoiceSessionError(context, error);
      }
    }
  );

  return controller;
}

function toVoiceSessionError(context: Context, error: unknown) {
  if (error instanceof NotFoundError) {
    return context.json(notFoundError(error.message), 404);
  }

  if (error instanceof VoiceSessionConfigurationError) {
    return context.json(serviceUnavailableError("La llamada no está disponible temporalmente."), 503);
  }

  if (error instanceof SharedAvatarNotReadyError) {
    return context.json(serviceUnavailableError(error.message, "AVATAR_NOT_READY"), 503);
  }

  if (error instanceof ExternalSessionLifecycleConfigurationError) {
    return context.json(serviceUnavailableError("La llamada no está disponible temporalmente."), 503);
  }

  if (error instanceof ShareSessionCountLimitError) {
    context.header("Retry-After", String(error.retryAfterSeconds));
    return context.json(
      rateLimitedError(
        "Este acceso alcanzó su límite de uso.",
        "SHARE_SESSION_COUNT_LIMIT",
        error.retryAfterSeconds
      ),
      429
    );
  }

  if (error instanceof ExternalSessionCapacityError) {
    context.header("Retry-After", String(error.retryAfterSeconds));
    return context.json(
      rateLimitedError(
        "El avatar alcanzó su capacidad temporal.",
        "EXTERNAL_SESSION_CAPACITY",
        error.retryAfterSeconds
      ),
      429
    );
  }

  if (error instanceof ActiveSessionExistsError) {
    return context.json(
      conflictErrorWithReason("Ya hay una llamada activa para este acceso.", "ACTIVE_SESSION_EXISTS"),
      409
    );
  }

  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "PLATFORM_RATE_LIMIT" &&
    "retryAfterSeconds" in error &&
    typeof error.retryAfterSeconds === "number"
  ) {
    context.header("Retry-After", String(error.retryAfterSeconds));
    return context.json(
      rateLimitedError(
        "Alcanzaste el límite temporal de llamadas.",
        "PLATFORM_RATE_LIMIT",
        error.retryAfterSeconds
      ),
      429
    );
  }

  if (
    error instanceof VoiceProviderTimeoutServiceError ||
    error instanceof LiveAvatarSessionTimeoutServiceError
  ) {
    return context.json(badGatewayError("No pudimos iniciar la llamada."), 502);
  }

  if (error instanceof VoiceProviderServiceError || error instanceof LiveAvatarSessionServiceError) {
    return context.json(badGatewayError("No pudimos iniciar la llamada."), 502);
  }

  throw error;
}
