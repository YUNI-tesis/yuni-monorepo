import { Hono, type Context } from "hono";
import {
  CreateAvatarGroupInputSchema,
  EndGroupVoiceSessionInputSchema,
  GroupProviderEventInputSchema,
  GroupVoiceParticipantFailureInputSchema,
  GroupVoiceParticipantStartedInputSchema,
  GroupVoiceTurnInputSchema,
  InterruptGroupVoiceSessionInputSchema,
  GroupSharingIneligibleError,
  NotFoundError,
  StartGroupVoiceSessionInputSchema,
  UpdateAvatarGroupInputSchema,
} from "@yuni/domain";
import type { CreatorSessionEnv } from "../auth/middleware";
import { badGatewayError, notFoundError, serviceUnavailableError, validationError } from "../../utils/errors";
import {
  createAvatarGroupsService,
  GroupAccountSharingDisabledError,
  GroupVoiceSessionUnavailableError,
  type AvatarGroupsServiceDependencies,
} from "./service";
import {
  GroupConsentVersionStaleError,
  GroupVoiceActiveSessionError,
  GroupVoiceCapacityError,
  GroupVoiceUsageLimitError,
} from "@yuni/db";
import { conflictErrorWithReason, rateLimitedError } from "../../utils/errors";

export type AvatarGroupsControllerDependencies = AvatarGroupsServiceDependencies;

export function createAvatarGroupsController(dependencies: AvatarGroupsControllerDependencies) {
  const controller = new Hono<CreatorSessionEnv>();
  const service = createAvatarGroupsService(dependencies);

  controller.get("/avatar-groups", async (context) => {
    const currentUser = context.get("currentUser");
    const scope = context.req.query("scope") ?? "owned";
    if (scope !== "all" && scope !== "owned" && scope !== "shared") {
      return context.json(validationError([{ message: "scope must be all, owned, or shared" }]), 400);
    }
    return context.json({ groups: await service.list(currentUser.id, scope) });
  });

  controller.post("/avatar-groups", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = CreateAvatarGroupInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json({ group: await service.create(currentUser.id, parsed.data) }, 201);
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.get("/avatar-groups/:groupId", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({
        group: await service.get(currentUser.id, context.req.param("groupId")),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.patch("/avatar-groups/:groupId", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = UpdateAvatarGroupInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json({
        group: await service.update(currentUser.id, context.req.param("groupId"), parsed.data),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.delete("/avatar-groups/:groupId", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json(await service.delete(currentUser.id, context.req.param("groupId")));
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/avatar-groups/:groupId/voice-sessions", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = StartGroupVoiceSessionInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        {
          voiceSession: await service.start(currentUser.id, context.req.param("groupId"), parsed.data),
        },
        201
      );
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/scribe-token", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({
        scribe: await service.scribeToken(currentUser.id, context.req.param("sessionId")),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/turns", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = GroupVoiceTurnInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(await service.turn(currentUser.id, context.req.param("sessionId"), parsed.data));
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/provider-events", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = GroupProviderEventInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.providerEvent(currentUser.id, context.req.param("sessionId"), parsed.data)
      );
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/interrupt", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = InterruptGroupVoiceSessionInputSchema.safeParse(
      await context.req.json().catch(() => ({}))
    );
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.interrupt(currentUser.id, context.req.param("sessionId"), parsed.data)
      );
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/participants/:avatarId/retry", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({
        participant: await service.retry(
          currentUser.id,
          context.req.param("sessionId"),
          context.req.param("avatarId")
        ),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/participants/:avatarId/started", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = GroupVoiceParticipantStartedInputSchema.safeParse(
      await context.req.json().catch(() => ({}))
    );
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.confirmParticipantStarted(
          currentUser.id,
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
    const currentUser = context.get("currentUser");
    const parsed = GroupVoiceParticipantFailureInputSchema.safeParse(
      await context.req.json().catch(() => ({}))
    );
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.participantFailure(
          currentUser.id,
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
    const currentUser = context.get("currentUser");
    try {
      return context.json(await service.heartbeat(currentUser.id, context.req.param("sessionId")));
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.post("/group-voice-sessions/:sessionId/end", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = EndGroupVoiceSessionInputSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(await service.end(currentUser.id, context.req.param("sessionId"), parsed.data));
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.get("/group-conversations/:conversationId", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({
        conversation: await service.getConversation(currentUser.id, context.req.param("conversationId")),
      });
    } catch (error) {
      return groupError(context, error);
    }
  });

  controller.get("/group-conversations", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({ conversations: await service.listConversations(currentUser.id) });
    } catch (error) {
      return groupError(context, error);
    }
  });

  return controller;
}

function groupError(context: Context, error: unknown) {
  if (error instanceof NotFoundError) return context.json(notFoundError(error.message), 404);
  if (error instanceof GroupVoiceSessionUnavailableError) {
    return context.json(serviceUnavailableError(error.message, "GROUP_NOT_READY"), 503);
  }
  if (error instanceof GroupConsentVersionStaleError) {
    return context.json(conflictErrorWithReason(error.message, "CONSENT_VERSION_STALE"), 409);
  }
  if (error instanceof GroupVoiceActiveSessionError) {
    return context.json(conflictErrorWithReason(error.message, "ACTIVE_SESSION_EXISTS"), 409);
  }
  if (error instanceof GroupVoiceUsageLimitError) {
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
  if (error instanceof GroupSharingIneligibleError) {
    return context.json(conflictErrorWithReason(error.message, "GROUP_SHARING_ROSTER_LOCKED"), 409);
  }
  if (error instanceof GroupAccountSharingDisabledError) {
    return context.json(
      serviceUnavailableError("Group account sharing is disabled", "FEATURE_DISABLED"),
      503
    );
  }
  if (error instanceof Error && /ElevenLabs|Live Avatar/i.test(error.message)) {
    return context.json(badGatewayError(error.message), 502);
  }
  throw error;
}
