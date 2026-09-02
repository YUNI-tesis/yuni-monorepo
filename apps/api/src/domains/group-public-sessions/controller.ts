import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  EndGroupVoiceSessionInputSchema,
  GroupProviderEventInputSchema,
  GroupVoiceParticipantFailureInputSchema,
  GroupVoiceParticipantStartedInputSchema,
  GroupVoiceTurnInputSchema,
  IdentifyPublicGroupLinkInputSchema,
  InterruptGroupVoiceSessionInputSchema,
  NotFoundError,
} from "@yuni/domain";
import {
  conflictErrorWithReason,
  notFoundError,
  rateLimitedError,
  serviceUnavailableError,
  unauthorizedError,
  validationError,
} from "../../utils/errors";
import {
  createPublicGroupSessionsService,
  GroupPublicSharingDisabledError,
  InvalidPublicGroupTokenError,
  PublicGroupConsentStaleError,
  PublicGroupNotReadyError,
  PublicGroupRateLimitedError,
  type PublicGroupSessionsDependencies,
} from "./service";
import {
  GroupConsentVersionStaleError,
  GroupVoiceActiveSessionError,
  GroupVoiceCapacityError,
  GroupVoiceUsageLimitError,
} from "@yuni/db";
import { GroupVoiceSessionUnavailableError } from "../avatar-groups/service";

const PUBLIC_GROUP_IDENTIFY_BODY_MAX_BYTES = 16 * 1024;
const PUBLIC_GROUP_COMMAND_BODY_MAX_BYTES = 32 * 1024;

export function createPublicGroupSessionsController(dependencies: PublicGroupSessionsDependencies) {
  const controller = new Hono();
  const service = createPublicGroupSessionsService(dependencies);

  controller.post(
    "/public/group-links/:slug/identify",
    requestBodyLimit(PUBLIC_GROUP_IDENTIFY_BODY_MAX_BYTES),
    async (context) => {
      const parsed = IdentifyPublicGroupLinkInputSchema.safeParse(await context.req.json().catch(() => null));
      if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
      try {
        return context.json({
          identity: await service.identify(
            context.req.param("slug"),
            parsed.data,
            dependencies.resolveClientIp?.(context) ?? "unknown"
          ),
        });
      } catch (error) {
        return handleError(context, error);
      }
    }
  );

  controller.post("/public/group-links/:slug/sessions", async (context) => {
    const token = bearer(context);
    if (!token) return context.json(unauthorizedError(), 401);
    try {
      return context.json(
        await service.start(
          context.req.param("slug"),
          token,
          dependencies.resolveClientIp?.(context) ?? "unknown"
        ),
        201
      );
    } catch (error) {
      return handleError(context, error);
    }
  });

  controller.post("/public/group-voice-sessions/:sessionId/scribe-token", async (context) => {
    return runtime(
      context,
      dependencies,
      (token, ip) => service.scribeToken(context.req.param("sessionId"), token, ip),
      "scribe"
    );
  });
  controller.post(
    "/public/group-voice-sessions/:sessionId/turns",
    requestBodyLimit(PUBLIC_GROUP_COMMAND_BODY_MAX_BYTES),
    async (context) => {
      const parsed = GroupVoiceTurnInputSchema.safeParse(await context.req.json().catch(() => ({})));
      if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
      return runtime(context, dependencies, (token, ip) =>
        service.turn(context.req.param("sessionId"), token, ip, parsed.data)
      );
    }
  );
  controller.post(
    "/public/group-voice-sessions/:sessionId/provider-events",
    requestBodyLimit(PUBLIC_GROUP_COMMAND_BODY_MAX_BYTES),
    async (context) => {
      const parsed = GroupProviderEventInputSchema.safeParse(await context.req.json().catch(() => ({})));
      if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
      return runtime(context, dependencies, (token, ip) =>
        service.providerEvent(context.req.param("sessionId"), token, ip, parsed.data)
      );
    }
  );
  controller.post(
    "/public/group-voice-sessions/:sessionId/interrupt",
    requestBodyLimit(PUBLIC_GROUP_COMMAND_BODY_MAX_BYTES),
    async (context) => {
      const parsed = InterruptGroupVoiceSessionInputSchema.safeParse(
        await context.req.json().catch(() => ({}))
      );
      if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
      return runtime(context, dependencies, (token, ip) =>
        service.interrupt(context.req.param("sessionId"), token, ip, parsed.data)
      );
    }
  );
  controller.post("/public/group-voice-sessions/:sessionId/participants/:avatarId/retry", async (context) =>
    runtime(
      context,
      dependencies,
      (token, ip) => service.retry(context.req.param("sessionId"), token, ip, context.req.param("avatarId")),
      "participant"
    )
  );
  controller.post(
    "/public/group-voice-sessions/:sessionId/participants/:avatarId/started",
    requestBodyLimit(PUBLIC_GROUP_COMMAND_BODY_MAX_BYTES),
    async (context) => {
      const parsed = GroupVoiceParticipantStartedInputSchema.safeParse(
        await context.req.json().catch(() => ({}))
      );
      if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
      return runtime(context, dependencies, (token, ip) =>
        service.confirmParticipantStarted(
          context.req.param("sessionId"),
          token,
          ip,
          context.req.param("avatarId"),
          parsed.data
        )
      );
    }
  );
  controller.post(
    "/public/group-voice-sessions/:sessionId/participants/:avatarId/failure",
    requestBodyLimit(PUBLIC_GROUP_COMMAND_BODY_MAX_BYTES),
    async (context) => {
      const parsed = GroupVoiceParticipantFailureInputSchema.safeParse(
        await context.req.json().catch(() => ({}))
      );
      if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
      return runtime(context, dependencies, (token, ip) =>
        service.participantFailure(
          context.req.param("sessionId"),
          token,
          ip,
          context.req.param("avatarId"),
          parsed.data
        )
      );
    }
  );
  controller.post("/public/group-voice-sessions/:sessionId/heartbeat", async (context) =>
    runtime(context, dependencies, (token, ip) =>
      service.heartbeat(context.req.param("sessionId"), token, ip)
    )
  );
  controller.post(
    "/public/group-voice-sessions/:sessionId/end",
    requestBodyLimit(PUBLIC_GROUP_COMMAND_BODY_MAX_BYTES),
    async (context) => {
      const parsed = EndGroupVoiceSessionInputSchema.safeParse(await context.req.json().catch(() => ({})));
      if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
      return runtime(context, dependencies, (token, ip) =>
        service.end(context.req.param("sessionId"), token, ip, parsed.data)
      );
    }
  );

  return controller;
}

function requestBodyLimit(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (context) => context.json(validationError([], "La solicitud es demasiado grande."), 413),
  });
}

async function runtime(
  context: Context,
  dependencies: PublicGroupSessionsDependencies,
  operation: (token: string, ip: string) => Promise<unknown>,
  key?: "scribe" | "participant"
) {
  const token = bearer(context);
  if (!token) return context.json(unauthorizedError(), 401);
  try {
    const result = await operation(token, dependencies.resolveClientIp?.(context) ?? "unknown");
    return context.json(key ? { [key]: result } : result);
  } catch (error) {
    return handleError(context, error);
  }
}

function bearer(context: Context) {
  const value = context.req.header("Authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function handleError(context: Context, error: unknown) {
  if (error instanceof InvalidPublicGroupTokenError) return context.json(unauthorizedError(), 401);
  if (error instanceof NotFoundError) return context.json(notFoundError("Public group not found"), 404);
  if (error instanceof GroupPublicSharingDisabledError) {
    return context.json(serviceUnavailableError("Group public sharing is disabled"), 503);
  }
  if (error instanceof PublicGroupConsentStaleError || error instanceof GroupConsentVersionStaleError) {
    return context.json(
      conflictErrorWithReason("El consentimiento quedó desactualizado.", "CONSENT_VERSION_STALE"),
      409
    );
  }
  if (error instanceof PublicGroupNotReadyError) {
    return context.json(serviceUnavailableError("El grupo todavía no está listo.", "GROUP_NOT_READY"), 503);
  }
  if (error instanceof GroupVoiceSessionUnavailableError) {
    return context.json(serviceUnavailableError(error.message, "GROUP_NOT_READY"), 503);
  }
  if (error instanceof GroupVoiceActiveSessionError) {
    return context.json(
      conflictErrorWithReason("Ya hay una llamada activa para este acceso.", "ACTIVE_SESSION_EXISTS"),
      409
    );
  }
  if (error instanceof GroupVoiceCapacityError) {
    context.header("Retry-After", String(error.retryAfterSeconds));
    return context.json(
      rateLimitedError(
        "Uno de los avatares alcanzó su capacidad temporal.",
        "EXTERNAL_SESSION_CAPACITY",
        error.retryAfterSeconds
      ),
      429
    );
  }
  if (error instanceof PublicGroupRateLimitedError || error instanceof GroupVoiceUsageLimitError) {
    context.header("Retry-After", String(error.retryAfterSeconds));
    return context.json(
      rateLimitedError(
        "Alcanzaste el límite temporal de llamadas.",
        error instanceof PublicGroupRateLimitedError ? "PLATFORM_RATE_LIMIT" : "SHARE_SESSION_COUNT_LIMIT",
        error.retryAfterSeconds
      ),
      429
    );
  }
  throw error;
}
