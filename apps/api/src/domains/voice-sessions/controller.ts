import { Hono, type Context } from "hono";
import { EndVoiceSessionInputSchema, NotFoundError } from "@yuni/domain";
import {
  badGatewayError,
  notFoundError,
  serviceUnavailableError,
  unauthorizedError,
  validationError,
} from "../../utils/errors";
import { getSessionToken, verifySessionToken } from "../auth/session";
import {
  createVoiceSessionsService,
  LiveAvatarSessionServiceError,
  LiveAvatarSessionTimeoutServiceError,
  VoiceProviderServiceError,
  VoiceProviderTimeoutServiceError,
  VoiceSessionConfigurationError,
  type VoiceSessionsServiceDependencies,
} from "./service";

export type VoiceSessionsControllerDependencies = VoiceSessionsServiceDependencies;

async function getCurrentSession(context: Context) {
  const token = getSessionToken(context);

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function createVoiceSessionsController(dependencies: VoiceSessionsControllerDependencies) {
  const controller = new Hono();
  const service = createVoiceSessionsService(dependencies);

  controller.post("/avatars/:avatarId/agent-provider/sync", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    try {
      const sync = await service.syncAgentProvider(session.userId, context.req.param("avatarId"));

      return context.json({ sync });
    } catch (error) {
      return toVoiceSessionError(context, error);
    }
  });

  controller.post("/avatars/:avatarId/voice-sessions", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    try {
      const voiceSession = await service.startVoiceSession(session.userId, context.req.param("avatarId"));

      return context.json({ voiceSession }, 201);
    } catch (error) {
      return toVoiceSessionError(context, error);
    }
  });

  controller.post("/voice-sessions/:realtimeSessionId/end", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    const body: unknown = await context.req.json().catch(() => ({}));
    const parsed = EndVoiceSessionInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      const voiceSession = await service.endVoiceSession(
        session.userId,
        context.req.param("realtimeSessionId"),
        parsed.data
      );

      return context.json({ voiceSession });
    } catch (error) {
      return toVoiceSessionError(context, error);
    }
  });

  return controller;
}

function toVoiceSessionError(context: Context, error: unknown) {
  if (error instanceof NotFoundError) {
    return context.json(notFoundError(error.message), 404);
  }

  if (error instanceof VoiceSessionConfigurationError) {
    return context.json(serviceUnavailableError(error.message), 503);
  }

  if (error instanceof VoiceProviderTimeoutServiceError || error instanceof LiveAvatarSessionTimeoutServiceError) {
    return context.json(badGatewayError(error.message), 502);
  }

  if (error instanceof VoiceProviderServiceError || error instanceof LiveAvatarSessionServiceError) {
    return context.json(badGatewayError(error.message), 502);
  }

  throw error;
}
