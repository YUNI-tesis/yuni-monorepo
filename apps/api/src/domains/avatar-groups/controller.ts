import { Hono, type Context } from "hono";
import {
  CreateAvatarGroupInputSchema,
  EndGroupVoiceSessionInputSchema,
  GroupProviderEventInputSchema,
  GroupVoiceParticipantFailureInputSchema,
  GroupVoiceParticipantStartedInputSchema,
  GroupVoiceTurnInputSchema,
  InterruptGroupVoiceSessionInputSchema,
  NotFoundError,
  UpdateAvatarGroupInputSchema,
} from "@yuni/domain";
import { getSessionToken, verifySessionToken } from "../auth/session";
import {
  badGatewayError,
  notFoundError,
  serviceUnavailableError,
  unauthorizedError,
  validationError,
} from "../../utils/errors";
import {
  createAvatarGroupsService,
  GroupVoiceSessionUnavailableError,
  type AvatarGroupsServiceDependencies,
} from "./service";

export type AvatarGroupsControllerDependencies = AvatarGroupsServiceDependencies;

async function requireUser(context: Context) {
  const token = getSessionToken(context);
  return token ? verifySessionToken(token) : null;
}

export function createAvatarGroupsController(dependencies: AvatarGroupsControllerDependencies) {
  const controller = new Hono();
  const service = createAvatarGroupsService(dependencies);

  controller.get("/avatar-groups", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    return context.json({ groups: await service.list(session.userId) });
  });

  controller.post("/avatar-groups", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = CreateAvatarGroupInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json({ group: await service.create(session.userId, parsed.data) }, 201);
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.get("/avatar-groups/:groupId", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json({ group: await service.get(session.userId, context.req.param("groupId")) });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.patch("/avatar-groups/:groupId", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = UpdateAvatarGroupInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json({
        group: await service.update(session.userId, context.req.param("groupId"), parsed.data),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.delete("/avatar-groups/:groupId", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json(await service.delete(session.userId, context.req.param("groupId")));
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/avatar-groups/:groupId/voice-sessions", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json(
        { voiceSession: await service.start(session.userId, context.req.param("groupId")) },
        201
      );
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/scribe-token", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json({
        scribe: await service.scribeToken(session.userId, context.req.param("sessionId")),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/turns", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = GroupVoiceTurnInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(await service.turn(session.userId, context.req.param("sessionId"), parsed.data));
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/provider-events", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = GroupProviderEventInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.providerEvent(session.userId, context.req.param("sessionId"), parsed.data)
      );
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/interrupt", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = InterruptGroupVoiceSessionInputSchema.safeParse(
      await context.req.json().catch(() => ({}))
    );
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.interrupt(session.userId, context.req.param("sessionId"), parsed.data)
      );
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/participants/:avatarId/retry", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json({
        participant: await service.retry(
          session.userId,
          context.req.param("sessionId"),
          context.req.param("avatarId")
        ),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/participants/:avatarId/started", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = GroupVoiceParticipantStartedInputSchema.safeParse(
      await context.req.json().catch(() => ({}))
    );
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.confirmParticipantStarted(
          session.userId,
          context.req.param("sessionId"),
          context.req.param("avatarId"),
          parsed.data
        )
      );
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/participants/:avatarId/failure", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = GroupVoiceParticipantFailureInputSchema.safeParse(
      await context.req.json().catch(() => ({}))
    );
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.participantFailure(
          session.userId,
          context.req.param("sessionId"),
          context.req.param("avatarId"),
          parsed.data
        )
      );
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/heartbeat", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json(await service.heartbeat(session.userId, context.req.param("sessionId")));
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/end", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = EndGroupVoiceSessionInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(await service.end(session.userId, context.req.param("sessionId"), parsed.data));
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.get("/group-conversations/:conversationId", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json({
        conversation: await service.getConversation(session.userId, context.req.param("conversationId")),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.get("/group-conversations", async (context) => {
    const session = await requireUser(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json({ conversations: await service.listConversations(session.userId) });
    } catch (error) {
      return groupError(context, error);
    }
  });

  return controller;
}

function groupError(context: Context, error: unknown) {
  if (error instanceof NotFoundError) return context.json(notFoundError(error.message), 404);
  if (error instanceof GroupVoiceSessionUnavailableError) {
    return context.json(serviceUnavailableError(error.message), 503);
  }
  if (error instanceof Error && /ElevenLabs|Live Avatar/i.test(error.message)) {
    return context.json(badGatewayError(error.message), 502);
  }
  throw error;
}
