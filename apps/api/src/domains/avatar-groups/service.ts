import {
  EndGroupVoiceSessionInputSchema,
  GroupProviderEventInputSchema,
  GroupVoiceParticipantFailureInputSchema,
  GroupVoiceParticipantStartedInputSchema,
  GroupVoiceTurnInputSchema,
  InterruptGroupVoiceSessionInputSchema,
  LiveAvatarConfigSchema,
  NotFoundError,
  VoiceConfigSchema,
  type CreateAvatarGroupInput,
  type EndGroupVoiceSessionInput,
  type GroupProviderEventInput,
  type GroupVoiceParticipantFailureInput,
  type GroupVoiceParticipantStartedInput,
  type GroupVoiceTurnInput,
  type InterruptGroupVoiceSessionInput,
  type StartGroupVoiceSessionInput,
  type UpdateAvatarGroupInput,
} from "@yuni/domain";
import {
  groupPublicSessionPrincipal,
  GroupVoiceRosterUnavailableError,
  type createAvatarGroupRepository,
  type createMessageRepository,
} from "@yuni/db";
import type { AvatarProvider } from "@yuni/avatars";
import type { ElevenLabsAgentProvider } from "@yuni/voice";
import {
  createDeterministicGroupRoundFallback,
  type GroupConversationOrchestrator,
  type GroupOrchestratorInput,
} from "@yuni/ai";
import { createLogger } from "@yuni/observability";
import { readSafeHttpUrl } from "../../utils/safe-url";
import type { ProviderTokenProtector } from "../public-sessions/provider-token-protector";
import { groupInteractionAvailability, groupSharingEligibility } from "../group-sharing/availability";
import { toInteractionLimits } from "../external-sessions/limits";

type GroupRepository = ReturnType<typeof createAvatarGroupRepository>;
type MessagesRepository = ReturnType<typeof createMessageRepository>;

export type AvatarGroupsServiceDependencies = {
  repository: GroupRepository;
  messagesRepository: MessagesRepository;
  liveAvatarProvider: Pick<AvatarProvider, "createLiteSessionToken"> & {
    stopSession(sessionToken: string): Promise<void>;
  };
  elevenLabsAgentProvider: Pick<ElevenLabsAgentProvider, "syncAvatarAgent" | "createScribeRealtimeToken">;
  orchestrator: GroupConversationOrchestrator;
  providerTokenProtector: ProviderTokenProtector;
  maxMinutes?: number;
  sharedMaxMinutes?: number;
  accountSharingEnabled?: () => boolean;
  publicSharingEnabled?: () => boolean;
  groupActivityEnabled?: () => boolean;
  externalCapacity?: {
    maxConcurrentPerParticipant: number;
    maxConcurrentPerAvatar: number;
  };
};

const logger = createLogger("@yuni/api:group-orchestration");
const GROUP_SHARED_CONTEXT_MAX_BYTES = 9_000;
const GROUP_SHARED_CONTEXT_MESSAGE_MAX_BYTES = 900;
const GROUP_SHARED_CONTEXT_MESSAGE_COUNT = 8;
const GROUP_SHARED_CONTEXT_NAME_MAX_BYTES = 120;
const GROUP_SHARED_CONTEXT_DESCRIPTION_MAX_BYTES = 320;

export class GroupVoiceSessionUnavailableError extends Error {
  constructor(message = "No pudimos conectar ningún avatar") {
    super(message);
    this.name = "GroupVoiceSessionUnavailableError";
  }
}

export class GroupAccountSharingDisabledError extends Error {}

export function createAvatarGroupsService(dependencies: AvatarGroupsServiceDependencies) {
  const maxMinutes = dependencies.maxMinutes ?? 10;
  const sharedMaxMinutes = dependencies.sharedMaxMinutes ?? 60;
  const getSharingChannels = () => ({
    account: dependencies.accountSharingEnabled?.() ?? true,
    public: dependencies.publicSharingEnabled?.() ?? true,
  });
  const isGroupActivityEnabled = () => dependencies.groupActivityEnabled?.() ?? true;

  async function requireSession(userId: string, sessionId: string) {
    const session = await dependencies.repository.findVoiceSessionForOwner(userId, sessionId);
    if (!session) throw new NotFoundError("Llamada grupal no encontrada");
    return session;
  }

  async function reconcileCurrentSpeak<T extends Record<string, unknown>>(
    userId: string,
    sessionId: string,
    session: NonNullable<Awaited<ReturnType<GroupRepository["findVoiceSessionForOwner"]>>>,
    response: T,
    idleDirective: { action: "listen"; reason: string } | null = null
  ) {
    let current = await dependencies.repository.currentDirectiveState(userId, sessionId);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const currentSession = current.session;
      const floor = toFloorDto(currentSession);
      const leaseExpiresAt = currentSession?.floorLeaseExpiresAt ?? null;
      const canDispatch =
        currentSession?.orchestrationPhase === "queued" &&
        current.turn?.status === "claimed" &&
        floor !== null &&
        floor.turnId === current.turn.id &&
        floor.avatarId === current.turn.avatarAgentId &&
        leaseExpiresAt !== null &&
        leaseExpiresAt.getTime() > Date.now();

      if (!canDispatch || !currentSession || !current.turn || !leaseExpiresAt) {
        return {
          ...response,
          phase: currentSession?.orchestrationPhase ?? "listening",
          directive: currentSession?.orchestrationPhase === "listening" ? idleDirective : null,
          floor,
        };
      }

      const directive = await createSpeakDirective(dependencies, session, current.turn, leaseExpiresAt);
      const verified = await dependencies.repository.currentDirectiveState(userId, sessionId);
      if (sameSpeakSnapshot(current, verified)) {
        return {
          ...response,
          phase: verified.session?.orchestrationPhase ?? "listening",
          directive,
          floor: toFloorDto(verified.session),
        };
      }
      current = verified;
    }

    return {
      ...response,
      phase: current.session?.orchestrationPhase ?? "listening",
      directive: null,
      floor: toFloorDto(current.session),
    };
  }

  async function initializeParticipant(
    session: Awaited<ReturnType<GroupRepository["findVoiceSessionForOwner"]>> extends infer T
      ? NonNullable<T>
      : never,
    participant: NonNullable<
      Awaited<ReturnType<GroupRepository["findVoiceSessionForOwner"]>>
    >["participants"][number],
    options: { allowProviderSync: boolean }
  ) {
    const avatar = participant.avatarAgent;
    let realtimeSessionId = participant.realtimeSessionId ?? "";
    let providerSessionId: string | null = null;
    let providerSessionToken: string | null = null;
    let encryptedProviderToken: string | null = null;
    let groupProviderReady = false;
    let groupProviderSyncAttempted = false;
    const expectedGroupProviderRevision = avatar.groupProviderSyncRevision;
    const inlineGroupProviderRevision = `inline:${session.id}:${participant.id}:${participant.realtimeSessionId ?? "new"}`;

    try {
      const liveConfig = LiveAvatarConfigSchema.parse(avatar.liveAvatarConfig);
      const voiceConfig = VoiceConfigSchema.parse(avatar.voiceConfig);
      const realtimeParticipant = participant.realtimeSessionId
        ? participant
        : await dependencies.repository.createRealtimeParticipant(
            participant.id,
            session.conversationId,
            avatar.id
          );
      realtimeSessionId = realtimeParticipant.realtimeSessionId ?? "";
      if (!realtimeSessionId) throw new Error("No pudimos preparar el intento del participante");
      let groupProviderAgentId = avatar.groupProviderAgentId;
      const projectionManagedBySharing = Boolean(avatar.avatarGroupMembers?.length);
      if (options.allowProviderSync && !projectionManagedBySharing) {
        const claimed = await dependencies.repository.updateGroupProvider(
          avatar.id,
          {
            status: "syncing",
            error: null,
            revision: inlineGroupProviderRevision,
          },
          expectedGroupProviderRevision
        );
        if (!claimed) {
          throw new GroupVoiceSessionUnavailableError("El grupo todavía se está preparando");
        }
        groupProviderSyncAttempted = true;
        const sync = await dependencies.elevenLabsAgentProvider.syncAvatarAgent({
          id: avatar.id,
          name: avatar.name,
          description: avatar.description,
          instructions: avatar.instructions,
          context: avatar.context,
          voiceConfig,
          providerAgentId: avatar.groupProviderAgentId,
          providerSyncFingerprint:
            avatar.groupProviderSyncStatus === "synced" ? avatar.groupProviderSyncFingerprint : null,
          sessionMode: "group",
          knowledgeBase: buildKnowledgeBase(avatar),
          includeInlineContext: !(
            avatar.providerContextSyncStatus === "synced" && avatar.providerContextDocumentId
          ),
        });
        groupProviderAgentId = sync.providerAgentId;
        const committed = await dependencies.repository.updateGroupProvider(
          avatar.id,
          {
            status: "synced",
            agentId: sync.providerAgentId,
            fingerprint: sync.providerSyncFingerprint,
            error: null,
          },
          inlineGroupProviderRevision
        );
        if (!committed) {
          throw new GroupVoiceSessionUnavailableError("El grupo todavía se está preparando");
        }
      } else if (avatar.groupProviderSyncStatus !== "synced" || !groupProviderAgentId) {
        throw new GroupVoiceSessionUnavailableError("El grupo todavía se está preparando");
      }
      groupProviderReady = true;
      const live = await dependencies.liveAvatarProvider.createLiteSessionToken({
        avatarId: liveConfig.avatarId,
        elevenLabsAgentId: groupProviderAgentId,
      });
      providerSessionId = live.sessionId;
      providerSessionToken = live.sessionToken;
      encryptedProviderToken = dependencies.providerTokenProtector.encrypt(live.sessionToken);
      const activated = await dependencies.repository.activateParticipantConnection(
        participant.id,
        realtimeSessionId,
        live.sessionId,
        encryptedProviderToken
      );
      if (!activated) throw new Error("El intento del participante ya no está vigente");

      return {
        id: participant.id,
        avatar: toParticipantAvatar(avatar),
        realtimeSessionId,
        participantAttemptId: realtimeSessionId,
        status: "active" as const,
        sessionToken: live.sessionToken,
        sessionId: live.sessionId,
        error: null,
      };
    } catch (error) {
      const message = providerErrorMessage(error);
      let durableCleanupRegistered = false;
      if (realtimeSessionId && encryptedProviderToken) {
        try {
          await dependencies.repository.abandonParticipantConnection(
            participant.id,
            realtimeSessionId,
            providerSessionId,
            encryptedProviderToken,
            message
          );
          durableCleanupRegistered = true;
        } catch (cleanupError) {
          logger.error("group participant cleanup could not be persisted", {
            sessionId: session.id,
            participantId: participant.id,
            error: cleanupError instanceof Error ? cleanupError.message : "Unknown error",
          });
        }
      }
      if (providerSessionToken && !durableCleanupRegistered) {
        await dependencies.liveAvatarProvider.stopSession(providerSessionToken).catch((stopError) => {
          logger.error("group participant provider cleanup failed", {
            sessionId: session.id,
            participantId: participant.id,
            error: stopError instanceof Error ? stopError.message : "Unknown error",
          });
        });
      }
      await Promise.allSettled([
        !groupProviderSyncAttempted || groupProviderReady
          ? Promise.resolve()
          : dependencies.repository.updateGroupProvider(
              avatar.id,
              {
                status: "failed",
                error: message,
              },
              inlineGroupProviderRevision
            ),
        realtimeSessionId
          ? dependencies.repository.markParticipantErrored(participant.id, realtimeSessionId, message)
          : Promise.resolve(false),
      ]);
      return {
        id: participant.id,
        avatar: toParticipantAvatar(avatar),
        realtimeSessionId,
        participantAttemptId: realtimeSessionId || null,
        status: "errored" as const,
        sessionToken: null,
        sessionId: null,
        error: message,
      };
    }
  }

  async function initializeSession(
    principalId: string,
    groupId: string,
    session: { id: string; conversationId: string; expiresAt: Date },
    strictFullRoster: boolean
  ) {
    const detailed = await requireSession(principalId, session.id);
    const participants = await Promise.all(
      detailed.participants.map((participant) =>
        initializeParticipant(detailed, participant, { allowProviderSync: !strictFullRoster })
      )
    );
    const activeCount = participants.filter((participant) => participant.status === "active").length;
    const minimum = strictFullRoster ? participants.length : Math.min(2, participants.length);
    if (activeCount < minimum) {
      await dependencies.repository.endSession(principalId, session.id, "errored");
      logger.warn("group sharing start denied", {
        sessionId: session.id,
        groupId,
        reason: strictFullRoster ? "full_roster_failed" : "insufficient_participants",
      });
      throw new GroupVoiceSessionUnavailableError(
        strictFullRoster
          ? "No pudimos conectar el roster completo"
          : "El grupo necesita al menos dos participantes disponibles"
      );
    }
    return {
      id: session.id,
      groupId,
      conversationId: session.conversationId,
      status: "connecting" as const,
      expiresAt: session.expiresAt.toISOString(),
      participants,
    };
  }

  return {
    async list(userId: string, scope: "all" | "owned" | "shared" = "owned") {
      const sharingChannels = getSharingChannels();
      const activityEnabled = isGroupActivityEnabled();
      const groups =
        scope === "owned" || !sharingChannels.account
          ? await dependencies.repository.listOwned(userId)
          : await dependencies.repository.listAccessible(userId);
      return groups
        .filter((group) => scope !== "shared" || group.ownerId !== userId)
        .map((group) => toGroupDto(group, userId, sharingChannels, activityEnabled));
    },

    async get(userId: string, groupId: string) {
      const sharingChannels = getSharingChannels();
      const group = sharingChannels.account
        ? await dependencies.repository.findAccessible(userId, groupId)
        : await dependencies.repository.findOwned(userId, groupId);
      if (!group) throw new NotFoundError("Grupo no encontrado");
      return toGroupDto(group, userId, sharingChannels, isGroupActivityEnabled());
    },

    async create(userId: string, input: CreateAvatarGroupInput) {
      const sharingChannels = getSharingChannels();
      return toGroupDto(
        await dependencies.repository.create(userId, input),
        userId,
        sharingChannels,
        isGroupActivityEnabled()
      );
    },

    async update(userId: string, groupId: string, input: UpdateAvatarGroupInput) {
      await dependencies.repository.update(userId, groupId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarIds !== undefined ? { avatarIds: input.avatarIds } : {}),
      });
      const group = await dependencies.repository.findAccessible(userId, groupId);
      if (!group) throw new NotFoundError("Grupo no encontrado");
      return toGroupDto(group, userId, getSharingChannels(), isGroupActivityEnabled());
    },

    async delete(userId: string, groupId: string) {
      await dependencies.repository.delete(userId, groupId);
      return { ok: true as const };
    },

    async start(userId: string, groupId: string, input: StartGroupVoiceSessionInput = {}) {
      let session;
      const group = await dependencies.repository.findAccessible(userId, groupId);
      if (!group) throw new NotFoundError("Grupo no encontrado");
      const shared = group.ownerId !== userId;
      if (shared && !(dependencies.accountSharingEnabled?.() ?? true)) {
        throw new GroupAccountSharingDisabledError();
      }
      if (shared) {
        logger.info("group sharing start requested", { groupId, targetKind: "account_grant" });
      }
      try {
        session = shared
          ? await dependencies.repository.createSharedVoiceSession(
              userId,
              groupId,
              "consentScopeId" in input
                ? { scopeId: input.consentScopeId, version: input.consentVersion }
                : null,
              sharedMaxMinutes,
              dependencies.externalCapacity
            )
          : await dependencies.repository.createVoiceSession(userId, groupId, maxMinutes);
      } catch (error) {
        if (shared) {
          logger.warn("group sharing start denied", {
            groupId,
            targetKind: "account_grant",
            reason: error instanceof Error ? error.name : "unknown",
          });
        }
        if (error instanceof GroupVoiceRosterUnavailableError) {
          throw new GroupVoiceSessionUnavailableError("El grupo todavía se está preparando");
        }
        if (
          error instanceof NotFoundError &&
          /participantes disponibles|avatares no están disponibles/i.test(error.message)
        ) {
          throw new GroupVoiceSessionUnavailableError(
            "El grupo necesita al menos dos participantes disponibles"
          );
        }
        throw error;
      }
      if (shared) {
        logger.info("group sharing start reserved", {
          groupId,
          targetKind: "account_grant",
          sessionId: session.id,
        });
      }
      return initializeSession(userId, groupId, session, shared);
    },

    async startPublic(input: {
      shareLinkId: string;
      groupId: string;
      participantEmail: string;
      consentedAt: Date;
      consentScopeId: string;
      consentVersion: number;
    }) {
      let reserved;
      try {
        reserved = await dependencies.repository.createPublicVoiceSession({
          shareLinkId: input.shareLinkId,
          participantEmail: input.participantEmail,
          consentedAt: input.consentedAt,
          consentScopeId: input.consentScopeId,
          consentVersion: input.consentVersion,
          maxMinutes: sharedMaxMinutes,
          ...(dependencies.externalCapacity ? { capacity: dependencies.externalCapacity } : {}),
        });
      } catch (error) {
        if (error instanceof GroupVoiceRosterUnavailableError) {
          throw new GroupVoiceSessionUnavailableError("El grupo todavía se está preparando");
        }
        throw error;
      }
      const principalId = groupPublicSessionPrincipal(reserved.publicSession.id);
      try {
        return {
          publicSession: reserved.publicSession,
          voiceSession: await initializeSession(principalId, input.groupId, reserved.voiceSession, true),
        };
      } catch (error) {
        await dependencies.repository
          .endSession(principalId, reserved.voiceSession.id, "errored")
          .catch(() => undefined);
        throw error;
      }
    },

    async retry(userId: string, sessionId: string, avatarId: string) {
      const session = await requireSession(userId, sessionId);
      if (session.status !== "active" && session.status !== "connecting") {
        throw new GroupVoiceSessionUnavailableError("La llamada ya terminó");
      }
      const participant = session.participants.find((item) => item.avatarAgentId === avatarId);
      if (!participant) throw new NotFoundError("Participante no encontrado");
      if (participant.status !== "errored") {
        throw new GroupVoiceSessionUnavailableError("El participante no está disponible para reintentar");
      }
      if ((session.groupAccessGrantId || session.groupPublicSessionId) && !session.activatedAt) {
        throw new GroupVoiceSessionUnavailableError("El roster completo todavía no fue confirmado");
      }
      const claimed = await dependencies.repository.beginParticipantRetry(userId, sessionId, avatarId);
      if (!claimed) {
        throw new GroupVoiceSessionUnavailableError("El participante ya se está reconectando");
      }
      return initializeParticipant(session, claimed, {
        allowProviderSync: !session.groupAccessGrantId && !session.groupPublicSessionId,
      });
    },

    async confirmParticipantStarted(
      userId: string,
      sessionId: string,
      avatarId: string,
      input: GroupVoiceParticipantStartedInput
    ) {
      const parsed = GroupVoiceParticipantStartedInputSchema.parse(input);
      const session = await requireSession(userId, sessionId);
      assertLive(session, true);
      const confirmed = await dependencies.repository.confirmParticipantStarted(
        userId,
        sessionId,
        avatarId,
        parsed.participantAttemptId
      );
      if (!confirmed) throw new NotFoundError("Intento de participante no encontrado");
      const active = await dependencies.repository.markSessionActive(sessionId);
      if (!active) {
        const refreshed = await requireSession(userId, sessionId);
        if (refreshed.status !== "connecting") {
          throw new GroupVoiceSessionUnavailableError("La llamada se canceló antes de activar el roster");
        }
      }
      if (active && !session.activatedAt) {
        logger.info("group sharing session activated", {
          groupId: session.avatarGroupId,
          sessionId,
          targetKind: session.groupPublicSessionId
            ? "public_link"
            : session.groupAccessGrantId
              ? "account_grant"
              : "owner",
        });
      }
      return { ok: true as const, status: active ? ("active" as const) : ("connecting" as const) };
    },

    async scribeToken(userId: string, sessionId: string) {
      const session = await requireSession(userId, sessionId);
      assertLive(session);
      return dependencies.elevenLabsAgentProvider.createScribeRealtimeToken();
    },

    async turn(userId: string, sessionId: string, input: GroupVoiceTurnInput) {
      const parsed = GroupVoiceTurnInputSchema.parse(input);
      const session = await requireSession(userId, sessionId);
      assertLive(session);
      const startedAt = Date.now();
      const beginning = await dependencies.repository.beginRound(userId, sessionId, parsed);
      if (beginning.kind !== "created") {
        return reconcileCurrentSpeak(
          userId,
          sessionId,
          session,
          {
            round: beginning.kind === "duplicate" ? toRoundDto(beginning.round) : null,
          },
          beginning.kind === "busy" ? null : { action: "listen" as const, reason: beginning.kind }
        );
      }

      const messages = await dependencies.messagesRepository.listByConversation(session.conversationId);
      const activeParticipants = session.participants.filter(
        (participant) => participant.status === "active"
      );
      const roster = activeParticipants.map(({ avatarAgent: avatar }) => ({
        id: avatar.id,
        name: avatar.name,
        description: avatar.description,
        instructions: avatar.instructions,
        knowledgeDocumentNames: avatar.documents
          .filter(
            (document) =>
              document.providerSync?.status === "synced" && Boolean(document.providerSync.providerDocumentId)
          )
          .map((document) => document.fileName),
      }));

      const orchestratorInput: GroupOrchestratorInput = {
        transcript: messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({
            id: message.id,
            role: message.role as "user" | "assistant",
            content: message.content,
            speakerAvatarId: message.speakerAvatarId,
          })),
        rollingSummary: session.rollingSummary,
        currentRequest: parsed.content,
        currentMessageId: beginning.round.userMessageId,
        roster,
        contextVersion: beginning.round.contextVersion,
      };

      let plan;
      const deliberationStartedAt = Date.now();
      try {
        plan = await dependencies.orchestrator.planRound(orchestratorInput);
      } catch (error) {
        logger.error("group round orchestration failed", {
          sessionId,
          roundId: beginning.round.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        plan = createDeterministicGroupRoundFallback(orchestratorInput, {
          fallbackReason: "orchestrator_exception",
        });
      }

      const activeIds = new Set(activeParticipants.map((participant) => participant.avatarAgentId));
      const instructionById = new Map(
        plan.instructions
          .filter((instruction) => activeIds.has(instruction.avatarId))
          .map((instruction) => [instruction.avatarId, instruction])
      );
      const turns = [...instructionById.values()].map((instruction, position) => ({
        avatarAgentId: instruction.avatarId,
        position,
        instructionText: instruction.instruction,
      }));
      const fallbackTurns: typeof turns = [];
      let remainingFallbackRoster = roster.filter((avatar) => !instructionById.has(avatar.id));
      while (remainingFallbackRoster.length > 0) {
        const fallback = createDeterministicGroupRoundFallback(
          { ...orchestratorInput, roster: remainingFallbackRoster },
          { fallbackReason: "participant_degraded_during_deliberation" }
        );
        const nextInstructions = fallback.instructions.filter((instruction) =>
          remainingFallbackRoster.some((avatar) => avatar.id === instruction.avatarId)
        );
        if (nextInstructions.length === 0) break;
        for (const instruction of nextInstructions) {
          fallbackTurns.push({
            avatarAgentId: instruction.avatarId,
            position: fallbackTurns.length,
            instructionText: instruction.instruction,
          });
        }
        const selected = new Set(nextInstructions.map((instruction) => instruction.avatarId));
        remainingFallbackRoster = remainingFallbackRoster.filter((avatar) => !selected.has(avatar.id));
      }
      const queued = await dependencies.repository.queueRound(sessionId, beginning.round.id, {
        intent: plan.intent,
        routingPlan: plan.routing,
        turns,
        fallbackTurns,
      });
      logger.info("group round planned", {
        sessionId,
        roundId: beginning.round.id,
        intent: plan.intent,
        durationMs: Date.now() - startedAt,
        deliberationMs: Date.now() - deliberationStartedAt,
        size: turns.length,
        strategy: plan.routing.strategy,
        model: plan.routing.model,
        fallbackReason: plan.routing.fallbackReason,
      });
      if (!queued) {
        return reconcileCurrentSpeak(
          userId,
          sessionId,
          session,
          { round: { ...toRoundDto(beginning.round), intent: plan.intent, status: "failed" } },
          {
            action: "listen" as const,
            reason:
              plan.intent === "named"
                ? ("mentioned_participant_unavailable" as const)
                : ("no_speaker" as const),
          }
        );
      }
      return reconcileCurrentSpeak(userId, sessionId, session, {
        round: { ...toRoundDto(beginning.round), intent: plan.intent, status: "queued" },
      });
    },

    async providerEvent(userId: string, sessionId: string, input: GroupProviderEventInput) {
      const parsed = GroupProviderEventInputSchema.parse(input);
      const session = await requireSession(userId, sessionId);
      const acceptsLateContent =
        parsed.type === "agent_response" || parsed.type === "agent_response_correction";
      if (session.status === "connecting" || !session.activatedAt) {
        throw new GroupVoiceSessionUnavailableError("El roster completo todavía no fue confirmado");
      }
      if (!acceptsLateContent) assertLive(session);
      const result = await dependencies.repository.recordProviderEvent(userId, sessionId, {
        sourceEventId: parsed.sourceEventId,
        turnId: parsed.turnId,
        avatarId: parsed.avatarId,
        type: parsed.type,
        ...(parsed.content !== undefined ? { content: parsed.content } : {}),
      });
      logger.info("group provider event", {
        sessionId,
        turnId: parsed.turnId,
        avatarId: parsed.avatarId,
        eventType: parsed.type,
        result: result.kind,
      });
      if (result.kind === "unauthorized") {
        logger.warn("unauthorized group provider event rejected", {
          sessionId,
          turnId: parsed.turnId,
          avatarId: parsed.avatarId,
          eventType: parsed.type,
        });
        if (parsed.type !== "speak_started") {
          return {
            phase: result.session.orchestrationPhase,
            directive: null,
            floor: toFloorDto(result.session),
          };
        }
        return {
          phase: result.session.orchestrationPhase,
          directive: {
            action: "suppress" as const,
            avatarId: parsed.avatarId,
            reason: result.reason === "unknown_turn" ? "unauthorized_audio" : "invalid_lease",
          },
          floor: toFloorDto(result.session),
        };
      }
      if (result.kind === "next" && result.next) {
        return reconcileCurrentSpeak(userId, sessionId, session, {});
      }
      if (result.kind === "completed" || result.kind === "interrupted") {
        return {
          phase: "listening" as const,
          directive: {
            action: "listen" as const,
            reason: result.kind === "completed" ? "round_complete" : "interrupted",
          },
          floor: null,
        };
      }
      if (result.kind === "duplicate") {
        const current = await dependencies.repository.currentDirectiveState(userId, sessionId);
        if (parsed.type === "speak_started") {
          const stillOwnsAcceptedSpeech =
            parsed.turnId !== null &&
            current.turn?.id === parsed.turnId &&
            current.turn.avatarAgentId === parsed.avatarId &&
            current.session?.floorOwnerAvatarId === parsed.avatarId &&
            current.session.orchestrationPhase === "speaking";
          if (!stillOwnsAcceptedSpeech) {
            const currentSession = current.session;
            const ownsAnotherCurrentTurn =
              currentSession !== null &&
              current.turn?.avatarAgentId === parsed.avatarId &&
              current.turn.id !== parsed.turnId &&
              currentSession.floorOwnerAvatarId === parsed.avatarId &&
              ["queued", "speaking", "committing"].includes(currentSession.orchestrationPhase);
            if (ownsAnotherCurrentTurn) {
              return {
                phase: currentSession.orchestrationPhase,
                directive: null,
                floor: toFloorDto(currentSession),
              };
            }
            return {
              phase: current.session?.orchestrationPhase ?? "listening",
              directive: {
                action: "suppress" as const,
                avatarId: parsed.avatarId,
                reason: parsed.turnId === null ? ("unauthorized_audio" as const) : ("invalid_lease" as const),
              },
              floor: toFloorDto(current.session),
            };
          }
        }
        if (
          parsed.type === "speak_ended" &&
          current.turn &&
          current.turn.id !== parsed.turnId &&
          current.session?.floorLeaseExpiresAt
        ) {
          return reconcileCurrentSpeak(userId, sessionId, session, {});
        }
        if (parsed.type === "speak_ended" && !current.turn) {
          return {
            phase: "listening" as const,
            directive: { action: "listen" as const, reason: "round_complete" },
            floor: null,
          };
        }
        if (
          parsed.type === "interruption" &&
          current.session?.orchestrationPhase === "listening" &&
          !current.turn
        ) {
          return {
            phase: "listening" as const,
            directive: { action: "listen" as const, reason: "interrupted" },
            floor: null,
          };
        }
        return {
          phase: current.session?.orchestrationPhase ?? "listening",
          directive: null,
          floor: toFloorDto(current.session),
        };
      }
      return {
        phase: result.session.orchestrationPhase,
        directive: null,
        floor: toFloorDto(result.session),
      };
    },

    async interrupt(userId: string, sessionId: string, input: InterruptGroupVoiceSessionInput) {
      const parsed = InterruptGroupVoiceSessionInputSchema.parse(input);
      const session = await requireSession(userId, sessionId);
      assertLive(session);
      const result = await dependencies.repository.interruptRound(userId, sessionId, {
        ...(parsed.expectedAvatarId ? { avatarId: parsed.expectedAvatarId } : {}),
        ...(parsed.expectedTurnId ? { turnId: parsed.expectedTurnId } : {}),
      });
      if (result.kind === "stale" || result.kind === "idle") {
        return {
          phase: result.session.orchestrationPhase,
          directive: null,
          floor: toFloorDto(result.session),
        };
      }
      return {
        phase: "listening" as const,
        directive: result.avatarId
          ? { action: "interrupt" as const, avatarId: result.avatarId, reason: parsed.reason }
          : { action: "listen" as const, reason: parsed.reason },
        floor: null,
      };
    },

    async participantFailure(
      userId: string,
      sessionId: string,
      avatarId: string,
      input: GroupVoiceParticipantFailureInput
    ) {
      const parsed = GroupVoiceParticipantFailureInputSchema.parse(input);
      const session = await requireSession(userId, sessionId);
      assertLive(session, true);
      const result = await dependencies.repository.failParticipant(userId, sessionId, avatarId, {
        sourceEventId: parsed.sourceEventId,
        reason: parsed.reason,
        participantAttemptId: parsed.participantAttemptId,
        ...(parsed.expectedTurnId ? { expectedTurnId: parsed.expectedTurnId } : {}),
      });
      if (
        (result.session.groupAccessGrantId || result.session.groupPublicSessionId) &&
        !result.session.activatedAt &&
        result.kind !== "stale" &&
        result.kind !== "duplicate"
      ) {
        await dependencies.repository.endSession(userId, sessionId, "errored");
        throw new GroupVoiceSessionUnavailableError("No pudimos confirmar el roster completo");
      }
      logger.warn("group participant failed", {
        sessionId,
        avatarId,
        sourceEventId: parsed.sourceEventId,
        participantAttemptId: parsed.participantAttemptId,
        expectedTurnId: parsed.expectedTurnId ?? null,
        result: result.kind,
      });
      const participant = {
        avatarId,
        participantAttemptId: result.participant.realtimeSessionId,
        status: result.participant.status,
        error: result.participant.errorMessage,
      };
      const refreshed = await requireSession(userId, sessionId);
      if (
        refreshed.activatedAt &&
        refreshed.participants.filter((item) => item.status === "active").length < 2
      ) {
        await dependencies.repository.endSession(userId, sessionId, "errored");
        logger.warn("group sharing session finished", {
          groupId: refreshed.avatarGroupId,
          sessionId,
          reason: "insufficient_participants",
          durationMs: refreshed.activatedAt ? Math.max(0, Date.now() - refreshed.activatedAt.getTime()) : 0,
        });
        return {
          phase: "ended" as const,
          directive: null,
          participant,
          floor: null,
        };
      }
      if (refreshed.activatedAt && result.kind !== "duplicate" && result.kind !== "stale") {
        logger.warn("group sharing session degraded", {
          groupId: refreshed.avatarGroupId,
          sessionId,
          reason: parsed.reason,
        });
      }
      if (result.kind === "next" && result.next) {
        return reconcileCurrentSpeak(userId, sessionId, session, { participant });
      }
      if (result.kind === "completed") {
        return {
          phase: "listening" as const,
          directive: { action: "listen" as const, reason: "participant_error" as const },
          participant,
          floor: null,
        };
      }
      if (result.kind === "duplicate") {
        return reconcileCurrentSpeak(userId, sessionId, session, { participant });
      }
      return {
        phase: result.session.orchestrationPhase,
        directive: null,
        participant,
        floor: toFloorDto(result.session),
      };
    },

    async heartbeat(userId: string, sessionId: string) {
      const session = await requireSession(userId, sessionId);
      assertLive(session, true);
      const refreshed = await dependencies.repository.heartbeat(userId, sessionId);
      if (refreshed.count !== 1) {
        throw new GroupVoiceSessionUnavailableError("La llamada ya terminó");
      }
      return { ok: true as const, expiresAt: session.expiresAt.toISOString() };
    },

    async end(userId: string, sessionId: string, input: EndGroupVoiceSessionInput) {
      EndGroupVoiceSessionInputSchema.parse(input);
      const session = await requireSession(userId, sessionId);
      await dependencies.repository.endSession(userId, sessionId);
      logger.info("group sharing session finished", {
        groupId: session.avatarGroupId,
        sessionId,
        reason: input.reason,
        durationMs: session.activatedAt ? Math.max(0, Date.now() - session.activatedAt.getTime()) : 0,
      });
      return { id: sessionId, status: "ended" as const };
    },

    async getConversation(userId: string, conversationId: string) {
      const conversation = await dependencies.repository.findConversationForCreator(userId, conversationId);
      if (!conversation) throw new NotFoundError("Conversación no encontrada");
      return {
        id: conversation.id,
        title: conversation.title,
        group: conversation.avatarGroupId
          ? {
              id: conversation.avatarGroupId,
              name:
                conversation.avatarGroupNameSnapshot ?? conversation.avatarGroup?.name ?? "Grupo eliminado",
            }
          : null,
        participants: conversation.groupParticipantSnapshots.length
          ? conversation.groupParticipantSnapshots.map((participant) => ({
              id: participant.sourceAvatarId,
              name: participant.name,
              description: participant.description,
              thumbnailUrl: readSafeHttpUrl(participant.thumbnailUrl),
            }))
          : conversation.conversationAvatars.map((participant) =>
              toParticipantAvatar(participant.avatarAgent)
            ),
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          speakerAvatarId: message.groupParticipantSnapshot?.sourceAvatarId ?? message.speakerAvatarId,
          speakerName: message.groupParticipantSnapshot?.name ?? message.speakerAvatar?.name ?? null,
          createdAt: message.createdAt.toISOString(),
        })),
      };
    },

    async listConversations(userId: string) {
      const conversations = await dependencies.repository.listConversationsForCreator(userId);
      return conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        groupId: conversation.avatarGroupId,
        groupName:
          conversation.avatarGroupNameSnapshot ?? conversation.avatarGroup?.name ?? "Grupo eliminado",
        participants: conversation.groupParticipantSnapshots.length
          ? conversation.groupParticipantSnapshots.map((participant) => ({
              id: participant.sourceAvatarId,
              name: participant.name,
              description: participant.description,
              thumbnailUrl: readSafeHttpUrl(participant.thumbnailUrl),
            }))
          : conversation.conversationAvatars.map((participant) =>
              toParticipantAvatar(participant.avatarAgent)
            ),
        messageCount: conversation._count.messages,
        status: conversation.status,
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        createdAt: conversation.createdAt.toISOString(),
      }));
    },

    async cleanupExpired(now = new Date()) {
      const staleCutoff = new Date(now.getTime() - 15_000);
      const recoveredRounds = await dependencies.repository.recoverStaleDeliberatingRounds(staleCutoff);
      if (recoveredRounds > 0) {
        logger.warn("stale group deliberations recovered", { recoveredRounds });
      }
      const expiredFloors = await dependencies.repository.listExpiredFloorSessions(now);
      for (const session of expiredFloors) {
        if (await dependencies.repository.expireFloor(session.id, now)) {
          logger.warn("group floor lease expired", {
            sessionId: session.id,
            turnId: session.floorTurnId,
            avatarId: session.floorOwnerAvatarId,
          });
        }
      }
      const expired = await dependencies.repository.listExpiredVoiceSessions(now);
      let expiredCount = 0;
      for (const session of expired) {
        const principalId = session.groupPublicSessionId
          ? groupPublicSessionPrincipal(session.groupPublicSessionId)
          : (session.initiatorUserId ?? session.ownerId);
        if (!principalId) {
          logger.error("group voice session has no cleanup principal", { sessionId: session.id });
          continue;
        }
        const claimed = await dependencies.repository.expireVoiceSessionIfStale(principalId, session.id, now);
        if (!claimed) continue;
        expiredCount += 1;
        logger.info("group sharing session cleanup", {
          groupId: session.avatarGroupId,
          sessionId: session.id,
          reason: "expired",
          durationMs: session.activatedAt ? Math.max(0, now.getTime() - session.activatedAt.getTime()) : 0,
        });
      }
      await dependencies.repository.enqueuePendingSessionCleanups();
      return expiredCount;
    },
  };
}

function assertLive(
  session: { status: string; expiresAt: Date; activatedAt?: Date | null },
  allowConnecting = false
) {
  if (session.status !== "active" && !(allowConnecting && session.status === "connecting")) {
    throw new GroupVoiceSessionUnavailableError("La llamada ya terminó");
  }
  if (!allowConnecting && !session.activatedAt) {
    throw new GroupVoiceSessionUnavailableError("El roster completo todavía no fue confirmado");
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new GroupVoiceSessionUnavailableError("La llamada alcanzó su límite de tiempo");
  }
}

function toGroupDto(
  group: {
    id: string;
    ownerId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    membershipVersion: number;
    owner?: { name: string | null };
    accessGrants?: Array<{
      id: string;
      participantUserId: string | null;
      status: string;
      maxSessionDurationSeconds: number | null;
      maxSessionsPer24Hours: number | null;
    }>;
    _count?: { accessGrants: number; shareLinks: number };
    members: Array<{
      accessGrantId: string | null;
      position: number;
      avatarAgent: Parameters<typeof toParticipantAvatar>[0] & {
        ownerId: string;
        status: string;
        voiceConfig: unknown;
        groupProviderAgentId: string | null;
        groupProviderSyncStatus: string;
      };
      accessGrant: { id: string; status: string; participantUserId: string | null } | null;
    }>;
  },
  viewerId: string,
  sharingChannels: { account: boolean; public: boolean },
  activityEnabled: boolean
) {
  const shared = group.ownerId !== viewerId;
  const viewerGrant = shared
    ? (group.accessGrants?.find(
        (grant) => grant.status === "active" && grant.participantUserId === viewerId
      ) ?? null)
    : null;
  const memberAvailability = group.members.map((member) => {
    const owned = member.avatarAgent.ownerId === group.ownerId;
    return (
      member.avatarAgent.status === "active" &&
      (shared
        ? member.avatarAgent.groupProviderSyncStatus === "synced" &&
          Boolean(member.avatarAgent.groupProviderAgentId) &&
          LiveAvatarConfigSchema.safeParse(member.avatarAgent.liveAvatarConfig).success &&
          VoiceConfigSchema.safeParse(member.avatarAgent.voiceConfig).success
        : owned ||
          (member.accessGrant?.status === "active" && member.accessGrant.participantUserId === group.ownerId))
    );
  });
  const ownerReadyMembers = memberAvailability.filter(Boolean).length;
  const interactionAvailability = shared
    ? groupInteractionAvailability(group)
    : group.members.length < 2 || group.members.length > 3
      ? {
          status: "unavailable" as const,
          reason: "invalid_roster" as const,
          readyMembers: ownerReadyMembers,
          totalMembers: group.members.length,
        }
      : ownerReadyMembers >= 2
        ? {
            status: "ready" as const,
            readyMembers: ownerReadyMembers,
            totalMembers: group.members.length,
          }
        : {
            status: "unavailable" as const,
            reason: "inactive_member" as const,
            readyMembers: ownerReadyMembers,
            totalMembers: group.members.length,
          };
  const sharingEligibility = groupSharingEligibility(group);
  const consent =
    shared && viewerGrant
      ? {
          scopeId: `group-access-grant:${viewerGrant.id}`,
          version: String(group.membershipVersion),
        }
      : null;
  return {
    id: group.id,
    name: group.name,
    membershipVersion: group.membershipVersion,
    sharingEligibility,
    sharingChannels,
    activityEnabled,
    interactionAvailability,
    hasActiveSharingChannels: (group._count?.accessGrants ?? 0) + (group._count?.shareLinks ?? 0) > 0,
    access: {
      type: shared ? ("shared" as const) : ("owner" as const),
      canEdit: !shared,
      canDelete: !shared,
      canShare:
        !shared &&
        sharingEligibility.status === "eligible" &&
        (sharingChannels.account || sharingChannels.public),
      canInteract: interactionAvailability.status === "ready",
      limits: viewerGrant ? toInteractionLimits(viewerGrant) : null,
      consent,
      sharedBy: shared ? { name: group.owner?.name ?? "Creador del grupo" } : null,
    },
    members: group.members.map((member, index) => {
      const owned = member.avatarAgent.ownerId === group.ownerId;
      return {
        ...toParticipantAvatar(member.avatarAgent),
        accessType: owned ? ("owner" as const) : ("shared" as const),
        viewerAccess: shared
          ? ("group_grant" as const)
          : owned
            ? ("owned" as const)
            : ("direct_grant" as const),
        available: memberAvailability[index] ?? false,
        position: member.position,
      };
    }),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

function toParticipantAvatar(avatar: {
  id: string;
  name: string;
  description: string;
  liveAvatarConfig: unknown;
}) {
  const live = LiveAvatarConfigSchema.safeParse(avatar.liveAvatarConfig);
  return {
    id: avatar.id,
    name: avatar.name,
    description: avatar.description,
    thumbnailUrl: live.success ? readSafeHttpUrl(live.data.thumbnailUrl) : null,
  };
}

function providerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos conectar este avatar";
}

async function createSpeakDirective(
  dependencies: Pick<AvatarGroupsServiceDependencies, "messagesRepository">,
  session: NonNullable<Awaited<ReturnType<GroupRepository["findVoiceSessionForOwner"]>>>,
  turn: {
    id: string;
    avatarAgentId: string;
    instructionText: string;
    avatarAgent: { name: string };
  },
  leaseExpiresAt: Date
) {
  const messages = await dependencies.messagesRepository.listByConversation(session.conversationId);
  const participantNames = new Map(
    session.participants.map((participant) => [participant.avatarAgentId, participant.avatarAgent.name])
  );
  const transcript = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-GROUP_SHARED_CONTEXT_MESSAGE_COUNT)
    .map((message) => {
      const speaker =
        message.role === "user"
          ? "Usuario"
          : (participantNames.get(message.speakerAvatarId ?? "") ?? "Avatar");
      return `${truncateUtf8Start(speaker, GROUP_SHARED_CONTEXT_NAME_MAX_BYTES)}: ${truncateUtf8Start(
        message.content,
        GROUP_SHARED_CONTEXT_MESSAGE_MAX_BYTES
      )}`;
    })
    .join("\n");
  const fixedContext = [
    "Contexto compartido de una llamada grupal dirigida por el usuario.",
    `Participantes en orden fijo: ${session.participants
      .map(
        (participant) =>
          `${truncateUtf8Start(
            participant.avatarAgent.name,
            GROUP_SHARED_CONTEXT_NAME_MAX_BYTES
          )} (${truncateUtf8Start(
            participant.avatarAgent.description,
            GROUP_SHARED_CONTEXT_DESCRIPTION_MAX_BYTES
          )})`
      )
      .join("; ")}.`,
  ].join("\n\n");
  const closingRule =
    "Las intervenciones listadas pertenecen a la misma conversación. No repitas lo ya dicho.";
  const contextWithoutTranscript = `${fixedContext}\n\n${closingRule}`;
  const transcriptPrefix = "\n\nConversación pública hasta este turno:\n";
  const transcriptBudget = Math.max(
    0,
    GROUP_SHARED_CONTEXT_MAX_BYTES -
      utf8ByteLength(contextWithoutTranscript) -
      utf8ByteLength(transcriptPrefix)
  );
  const boundedTranscript = transcript ? truncateUtf8End(transcript, transcriptBudget) : "";
  const context = boundedTranscript
    ? `${fixedContext}${transcriptPrefix}${boundedTranscript}\n\n${closingRule}`
    : contextWithoutTranscript;
  return {
    action: "speak" as const,
    turnId: turn.id,
    avatarId: turn.avatarAgentId,
    avatarName: turn.avatarAgent.name,
    context,
    instruction: turn.instructionText,
    leaseExpiresAt: leaseExpiresAt.toISOString(),
  };
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function truncateUtf8Start(value: string, maxBytes: number) {
  return truncateUtf8(value, maxBytes, "start");
}

function truncateUtf8End(value: string, maxBytes: number) {
  return truncateUtf8(value, maxBytes, "end");
}

function truncateUtf8(value: string, maxBytes: number, edge: "start" | "end") {
  if (maxBytes <= 0) return "";
  if (utf8ByteLength(value) <= maxBytes) return value;
  const codePoints = Array.from(value);
  let low = 0;
  let high = codePoints.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate =
      edge === "start"
        ? codePoints.slice(0, middle).join("")
        : codePoints.slice(codePoints.length - middle).join("");
    if (utf8ByteLength(candidate) <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return edge === "start"
    ? codePoints.slice(0, low).join("")
    : codePoints.slice(codePoints.length - low).join("");
}

function toRoundDto(round: { id: string; intent: string; status: string; contextVersion: number }) {
  return {
    id: round.id,
    intent: round.intent,
    status: round.status,
    contextVersion: round.contextVersion,
  };
}

function sameSpeakSnapshot(
  left: Awaited<ReturnType<GroupRepository["currentDirectiveState"]>>,
  right: Awaited<ReturnType<GroupRepository["currentDirectiveState"]>>
) {
  return (
    left.session?.orchestrationPhase === "queued" &&
    right.session?.orchestrationPhase === "queued" &&
    left.turn?.status === "claimed" &&
    right.turn?.status === "claimed" &&
    left.session.floorOwnerAvatarId === right.session.floorOwnerAvatarId &&
    left.session.floorTurnId === right.session.floorTurnId &&
    left.session.floorLeaseExpiresAt?.getTime() === right.session.floorLeaseExpiresAt?.getTime() &&
    (right.session.floorLeaseExpiresAt?.getTime() ?? 0) > Date.now() &&
    left.turn.id === right.turn.id &&
    left.turn.avatarAgentId === right.turn.avatarAgentId
  );
}

function toFloorDto(
  session: {
    floorOwnerAvatarId: string | null;
    floorTurnId: string | null;
    floorLeaseExpiresAt: Date | null;
  } | null
) {
  if (!session?.floorOwnerAvatarId || !session.floorTurnId || !session.floorLeaseExpiresAt) return null;
  return {
    avatarId: session.floorOwnerAvatarId,
    turnId: session.floorTurnId,
    leaseExpiresAt: session.floorLeaseExpiresAt.toISOString(),
  };
}

function buildKnowledgeBase(avatar: {
  name: string;
  providerContextDocumentId: string | null;
  providerContextSyncStatus: string;
  documents: Array<{
    fileName: string;
    providerSync: { providerDocumentId: string | null; status: string } | null;
  }>;
}) {
  const references: Array<{
    type: "text" | "file";
    name: string;
    id: string;
    usage_mode: "prompt" | "auto";
  }> = [];

  if (avatar.providerContextSyncStatus === "synced" && avatar.providerContextDocumentId) {
    references.push({
      type: "text",
      name: `Contexto de ${avatar.name}`,
      id: avatar.providerContextDocumentId,
      usage_mode: "prompt",
    });
  }

  for (const document of avatar.documents) {
    if (document.providerSync?.status === "synced" && document.providerSync.providerDocumentId) {
      references.push({
        type: "file",
        name: document.fileName,
        id: document.providerSync.providerDocumentId,
        usage_mode: "auto",
      });
    }
  }

  return references;
}
