"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentEventsEnum, LiveAvatarSession, SessionEvent } from "@heygen/liveavatar-web-sdk";
import { CommitStrategy, RealtimeEvents, Scribe, type RealtimeConnection } from "@elevenlabs/client";
import { Badge, Button, ErrorState, LoadingState, YuniIcon } from "@yuni/ui";
import {
  endGroupVoiceSession,
  getAvatarGroup,
  getGroupConversation,
  getGroupScribeToken,
  heartbeatGroupVoiceSession,
  interruptGroupVoiceSession,
  listGroupConversations,
  reportGroupProviderEvent,
  reportGroupParticipantFailure,
  retryGroupParticipant,
  startGroupVoiceSession,
  submitGroupTurn,
  type ApiAvatarGroup,
  type ApiGroupConversation,
  type ApiGroupConversationSummary,
  type ApiGroupFloorSnapshot,
  type ApiGroupOrchestrationResult,
  type ApiGroupTurnDirective,
  type ApiGroupOrchestrationPhase,
  type ApiGroupVoiceParticipant,
  type ApiGroupVoiceSession,
} from "../../lib/api/avatar-group-api";
import { getMe } from "../../lib/api/auth-api";
import { ApiClientError } from "../../lib/api/http-client";
import {
  CallExperienceShell,
  CallParticipantStage,
  InteractCallControls,
  InteractConversationHistoryPanel,
  type CallHistoryLoadStatus,
} from "./CallExperience";
import {
  applyGroupAudioGate,
  encodeElevenLabsAgentCommand,
  isAuthorizedSpeechEnd,
  isAuthorizedSpeechStart,
  providerEventSourceId,
  shouldSendGroupUserActivity,
  type ElevenLabsCommandType,
  type LocalFloorAuthorization,
} from "./group-call-runtime";
import {
  SharedCallPrivacyDialog,
  getSharedCallConsentStorageKey,
  readRememberedPrivacyChoice,
  rememberPrivacyChoiceForAvatar,
} from "./SharedCallPrivacyDialog";
import styles from "./Interact.module.css";

type LocalParticipant = ApiGroupVoiceParticipant & {
  clientStatus: "connecting" | "active" | "recovering" | "errored";
  clientError: string | null;
};

type LiveParticipantInstance = {
  session: LiveAvatarSession;
  participantAttemptId: string;
  generation: number;
  callEpoch: number;
};

type ParticipantFailureDelivery = {
  sourceEventId: string;
  sessionId: string;
  avatarId: string;
  participantAttemptId: string;
  generation: number;
  callEpoch: number;
  reason: "session_stopped" | "stream_error";
  expectedTurnId?: string;
  attempt: number;
  timer: number | null;
  state: "pending" | "acked" | "cancelled";
};

type LocalTurnLedgerEntry = {
  turnId: string;
  avatarId: string;
  callEpoch: number;
  state: "queued" | "speaking" | "completed" | "interrupted";
  originalResponse: string | null;
  latestResponse: string | null;
  responseReceived: boolean;
  responseKeys: Set<string>;
};

type ParsedElevenLabsResponse = {
  text: string;
  originalText: string | null;
  responseKeys: string[];
};

type TranscriptEntry = {
  id: string;
  role: "user" | "assistant";
  speakerName: string;
  content: string;
};

type TurnPhase = ApiGroupOrchestrationPhase;

type GroupConversationHistoryState = {
  summariesStatus: CallHistoryLoadStatus;
  summaries: ApiGroupConversationSummary[];
  summariesError: string | null;
  selectedConversationId: string | null;
  detailStatus: CallHistoryLoadStatus;
  detail: ApiGroupConversation | null;
  detailError: string | null;
};

const initialHistoryState: GroupConversationHistoryState = {
  summariesStatus: "idle",
  summaries: [],
  summariesError: null,
  selectedConversationId: null,
  detailStatus: "idle",
  detail: null,
  detailError: null,
};

const LIVE_PARTICIPANT_START_TIMEOUT_MS = 20_000;
const LIVE_PARTICIPANT_STOP_TIMEOUT_MS = 3_000;
const PARTICIPANT_FAILURE_REQUEST_TIMEOUT_MS = 5_000;
const PARTICIPANT_FAILURE_RETRY_DELAYS_MS = [0, 500, 1_500, 3_000, 5_000] as const;
const MAX_TURN_LEDGER_ENTRIES = 128;

export function GroupInteractCall({ groupId }: { groupId: string }) {
  const router = useRouter();
  const privacyDialog = useRef<HTMLDialogElement>(null);
  const [group, setGroup] = useState<ApiAvatarGroup | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [callStatus, setCallStatus] = useState<
    "idle" | "starting" | "active" | "degraded" | "ending" | "ended" | "error"
  >("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<LocalParticipant[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [turnOwnerId, setTurnOwnerId] = useState<string | null>(null);
  const [audibleOwnerId, setAudibleOwnerId] = useState<string | null>(null);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>("listening");
  const [isMuted, setIsMuted] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyState, setHistoryState] = useState<GroupConversationHistoryState>(initialHistoryState);
  const [rememberPrivacyChoice, setRememberPrivacyChoice] = useState(false);
  const [privacyStorageKeys, setPrivacyStorageKeys] = useState<string[]>([]);
  const [privacyAvatarNames, setPrivacyAvatarNames] = useState<string[]>([]);
  const [pendingFailureCount, setPendingFailureCount] = useState(0);
  const [pendingRetryCount, setPendingRetryCount] = useState(0);
  const sessionRef = useRef<ApiGroupVoiceSession | null>(null);
  const liveSessionsRef = useRef(new Map<string, LiveParticipantInstance>());
  const mediaElementsRef = useRef(new Map<string, HTMLVideoElement>());
  const audibleOwnerRef = useRef<string | null>(null);
  const mediaRefCallbacksRef = useRef(new Map<string, (element: HTMLVideoElement | null) => void>());
  const liveSessionCleanupRef = useRef(new Map<string, { generation: number; cleanup: () => void }>());
  const scribeRef = useRef<RealtimeConnection | null>(null);
  const scribeCleanupRef = useRef<(() => void) | null>(null);
  const orchestrationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const turnPhaseRef = useRef<TurnPhase>("listening");
  const floorAuthorizationRef = useRef<LocalFloorAuthorization | null>(null);
  const pendingDirectiveRef = useRef<{ turnId: string; avatarId: string; callEpoch: number } | null>(null);
  const reconcileServerResultRef = useRef<(result: ApiGroupOrchestrationResult) => Promise<void>>(
    async () => undefined
  );
  const speakingAvatarIdsRef = useRef(new Set<string>());
  const latestAvatarTextRef = useRef(new Map<string, string>());
  const committedTranscriptTurnIdsRef = useRef(new Set<string>());
  const handledTurnIdsRef = useRef(new Set<string>());
  const providerEventDeliveryStateRef = useRef(new Map<string, "inflight" | "acked" | "failed">());
  const participantGenerationRef = useRef(new Map<string, number>());
  const participantFailureDeliveriesRef = useRef(new Map<string, ParticipantFailureDelivery>());
  const participantFailureByGenerationRef = useRef(new Map<string, string>());
  const participantRetryInFlightRef = useRef(new Map<string, string>());
  const turnLedgerRef = useRef(new Map<string, LocalTurnLedgerEntry>());
  const responseTurnIdRef = useRef(new Map<string, string>());
  const startupPendingAvatarIdsRef = useRef(new Map<string, string>());
  const startupTimeoutsRef = useRef(new Map<string, { startupKey: string; timer: number }>());
  const startupCueFinishersRef = useRef(new Map<string, { startupKey: string; finish: () => void }>());
  const turnTimeoutRef = useRef<number | null>(null);
  const callEpochRef = useRef(0);
  const participantsRef = useRef<LocalParticipant[]>([]);
  const endingRef = useRef(false);
  const startingRef = useRef(false);
  const heartbeatInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const startRequestTokenRef = useRef(0);
  const expiryTimeoutRef = useRef<number | null>(null);
  const endCallRef = useRef<
    ((reason?: "user" | "timeout" | "no_participants" | "unload") => Promise<void>) | null
  >(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startRequestTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getAvatarGroup(groupId)
      .then(({ group: loaded }) => {
        if (!mounted) return;
        setGroup(loaded);
        setLoadStatus("ready");
      })
      .catch((error) => {
        if (error instanceof ApiClientError && error.status === 401) {
          router.push("/auth/login");
          return;
        }
        if (mounted) {
          setCallError(error instanceof Error ? error.message : "No pudimos cargar el grupo.");
          setLoadStatus("error");
        }
      });
    return () => {
      mounted = false;
    };
  }, [groupId, router]);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      setHistoryState((current) => ({
        ...current,
        selectedConversationId: conversationId,
        detailStatus: "loading",
        detail: null,
        detailError: null,
      }));
      try {
        const { conversation } = await getGroupConversation(conversationId);
        setHistoryState((current) => ({
          ...current,
          selectedConversationId: conversationId,
          detailStatus: "ready",
          detail: conversation,
          detailError: null,
        }));
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          router.push("/auth/login");
          return;
        }
        setHistoryState((current) => ({
          ...current,
          selectedConversationId: conversationId,
          detailStatus: "error",
          detail: null,
          detailError: error instanceof Error ? error.message : "No pudimos abrir este chat.",
        }));
      }
    },
    [router]
  );

  const loadHistory = useCallback(
    async (options: { selectLatest?: boolean } = {}) => {
      setHistoryState((current) => ({ ...current, summariesStatus: "loading", summariesError: null }));
      try {
        const { conversations } = await listGroupConversations();
        const groupConversations = conversations.filter((conversation) => conversation.groupId === groupId);
        setHistoryState((current) => ({
          ...current,
          summariesStatus: "ready",
          summaries: groupConversations,
          summariesError: null,
          selectedConversationId: groupConversations.some(
            (conversation) => conversation.id === current.selectedConversationId
          )
            ? current.selectedConversationId
            : null,
          detail:
            current.detail &&
            groupConversations.some((conversation) => conversation.id === current.detail?.id)
              ? current.detail
              : null,
        }));
        if (options.selectLatest && groupConversations[0]) {
          void loadConversation(groupConversations[0].id);
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          router.push("/auth/login");
          return;
        }
        setHistoryState((current) => ({
          ...current,
          summariesStatus: "error",
          summariesError: error instanceof Error ? error.message : "No pudimos cargar el historial.",
        }));
      }
    },
    [groupId, loadConversation, router]
  );

  const clearTurnTimeout = useCallback(() => {
    if (turnTimeoutRef.current !== null) {
      window.clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const applyAudioGate = useCallback((ownerAvatarId: string | null) => {
    audibleOwnerRef.current = ownerAvatarId;
    applyGroupAudioGate(mediaElementsRef.current, ownerAvatarId);
    setAudibleOwnerId(ownerAvatarId);
  }, []);

  const closeScribe = useCallback(() => {
    scribeCleanupRef.current?.();
    scribeCleanupRef.current = null;
    scribeRef.current?.close();
    scribeRef.current = null;
  }, []);

  const detachLiveSessionListeners = useCallback((avatarId: string, generation?: number) => {
    const registered = liveSessionCleanupRef.current.get(avatarId);
    if (!registered || (generation !== undefined && registered.generation !== generation)) return;
    registered.cleanup();
    liveSessionCleanupRef.current.delete(avatarId);
  }, []);

  const setServerPhase = useCallback((phase: TurnPhase) => {
    turnPhaseRef.current = phase;
    setTurnPhase(phase);
  }, []);

  const releaseDisplayedFloor = useCallback(() => {
    clearTurnTimeout();
    floorAuthorizationRef.current = null;
    pendingDirectiveRef.current = null;
    applyAudioGate(null);
    setTurnOwnerId(null);
    setActiveSpeakerId(null);
  }, [applyAudioGate, clearTurnTimeout]);

  const scheduleFloorExpiry = useCallback(
    (input: {
      turnId: string;
      avatarId: string;
      avatarName: string;
      leaseExpiresAt: string;
      callEpoch: number;
    }) => {
      clearTurnTimeout();
      const timeoutMs = Math.max(0, new Date(input.leaseExpiresAt).getTime() - Date.now());
      turnTimeoutRef.current = window.setTimeout(() => {
        const authorization = floorAuthorizationRef.current;
        const pendingDirective = pendingDirectiveRef.current;
        const ownsAuthorizedTurn =
          authorization?.turnId === input.turnId && authorization.callEpoch === input.callEpoch;
        const ownsPendingTurn =
          pendingDirective?.turnId === input.turnId && pendingDirective.callEpoch === input.callEpoch;
        if (!ownsAuthorizedTurn && !ownsPendingTurn) return;
        pendingDirectiveRef.current = null;
        if (ownsAuthorizedTurn) floorAuthorizationRef.current = null;
        speakingAvatarIdsRef.current.delete(input.avatarId);
        setActiveSpeakerId((current) => (current === input.avatarId ? null : current));
        setTurnOwnerId((current) => (current === input.avatarId ? null : current));
        const activeSessionId = sessionRef.current?.id;
        applyAudioGate(null);
        safelyInterruptLiveSession(liveSessionsRef.current.get(input.avatarId)?.session);
        if (!activeSessionId) return;
        void interruptGroupVoiceSession(activeSessionId, "timeout", {
          avatarId: input.avatarId,
          turnId: input.turnId,
        })
          .then(async (result) => {
            if (callEpochRef.current !== input.callEpoch) return;
            await reconcileServerResultRef.current(result);
            if (result.phase === "listening") {
              setCallError(`${input.avatarName} no respondió a tiempo. Ya podés volver a hablar.`);
            }
          })
          .catch((error) => {
            if (callEpochRef.current !== input.callEpoch) return;
            releaseDisplayedFloor();
            setServerPhase("listening");
            setCallError(error instanceof Error ? error.message : "No pudimos cerrar el turno vencido.");
          });
      }, timeoutMs + 250);
    },
    [applyAudioGate, clearTurnTimeout, releaseDisplayedFloor, setServerPhase]
  );

  const renewFloorLease = useCallback(
    (floor: ApiGroupFloorSnapshot) => {
      if (!floor) return;
      const authorization = floorAuthorizationRef.current;
      if (
        !authorization ||
        authorization.turnId !== floor.turnId ||
        authorization.avatarId !== floor.avatarId
      )
        return;
      const avatarName =
        participantsRef.current.find((item) => item.avatar.id === floor.avatarId)?.avatar.name ?? "El avatar";
      scheduleFloorExpiry({
        ...floor,
        avatarName,
        callEpoch: authorization.callEpoch,
      });
    },
    [scheduleFloorExpiry]
  );

  const sendUserActivity = useCallback(
    async (options: { floorOwnerAvatarId?: string | null; force?: boolean } = {}) => {
      const floorOwnerAvatarId =
        options.floorOwnerAvatarId === undefined
          ? (floorAuthorizationRef.current?.avatarId ?? pendingDirectiveRef.current?.avatarId ?? null)
          : options.floorOwnerAvatarId;
      const phase = turnPhaseRef.current;
      await Promise.allSettled(
        [...liveSessionsRef.current.entries()].map(async ([avatarId, instance]) => {
          const shouldSend = options.force
            ? floorOwnerAvatarId !== avatarId
            : shouldSendGroupUserActivity({ phase, floorOwnerAvatarId, avatarId });
          if (shouldSend) await sendElevenLabsCommand(instance.session, "user_activity", {});
        })
      );
    },
    []
  );

  const beginProviderEventDelivery = useCallback((sourceEventId: string) => {
    const deliveryState = providerEventDeliveryStateRef.current.get(sourceEventId);
    if (deliveryState === "inflight" || deliveryState === "acked") return false;
    providerEventDeliveryStateRef.current.set(sourceEventId, "inflight");
    return true;
  }, []);

  const refreshPendingFailureCount = useCallback(() => {
    setPendingFailureCount(
      [...participantFailureDeliveriesRef.current.values()].filter((delivery) => delivery.state === "pending")
        .length
    );
  }, []);

  const clearParticipantFailureDeliveries = useCallback(() => {
    for (const delivery of participantFailureDeliveriesRef.current.values()) {
      delivery.state = "cancelled";
      if (delivery.timer !== null) window.clearTimeout(delivery.timer);
    }
    participantFailureDeliveriesRef.current.clear();
    participantFailureByGenerationRef.current.clear();
    setPendingFailureCount(0);
  }, []);

  const enqueueParticipantFailure = useCallback(
    (input: {
      avatarId: string;
      participantAttemptId: string;
      generation: number;
      sourceEventId: string;
      reason: "session_stopped" | "stream_error";
      expectedTurnId?: string;
    }) => {
      const sessionId = sessionRef.current?.id;
      if (!sessionId || endingRef.current) return;
      const callEpoch = callEpochRef.current;
      const generationKey = `${sessionId}:${input.avatarId}:${input.participantAttemptId}`;
      if (participantFailureByGenerationRef.current.has(generationKey)) return;

      const authorization = floorAuthorizationRef.current;
      if (authorization?.avatarId === input.avatarId) {
        floorAuthorizationRef.current = null;
        speakingAvatarIdsRef.current.delete(input.avatarId);
        setActiveSpeakerId((current) => (current === input.avatarId ? null : current));
        setTurnOwnerId((current) => (current === input.avatarId ? null : current));
        applyAudioGate(null);
      } else {
        applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
      }
      if (pendingDirectiveRef.current?.avatarId === input.avatarId) {
        pendingDirectiveRef.current = null;
        setTurnOwnerId((current) => (current === input.avatarId ? null : current));
      }
      setPartialTranscript("");
      setCallStatus("degraded");
      setParticipants((current) => {
        const next: LocalParticipant[] = current.map((item) =>
          item.avatar.id === input.avatarId && item.participantAttemptId === input.participantAttemptId
            ? { ...item, clientStatus: "recovering", clientError: "Recuperando la conexión…" }
            : item
        );
        participantsRef.current = next;
        return next;
      });

      const delivery: ParticipantFailureDelivery = {
        ...input,
        sessionId,
        callEpoch,
        attempt: 0,
        timer: null,
        state: "pending",
      };
      participantFailureByGenerationRef.current.set(generationKey, input.sourceEventId);
      participantFailureDeliveriesRef.current.set(input.sourceEventId, delivery);
      refreshPendingFailureCount();

      const schedule = (delayMs: number) => {
        delivery.timer = window.setTimeout(() => void deliver(), delayMs);
      };
      const deliver = async () => {
        delivery.timer = null;
        if (
          delivery.state !== "pending" ||
          endingRef.current ||
          callEpochRef.current !== delivery.callEpoch ||
          sessionRef.current?.id !== delivery.sessionId
        )
          return;
        const abortController = new AbortController();
        try {
          const result = await withAbortableDeadline(
            reportGroupParticipantFailure(
              delivery.sessionId,
              delivery.avatarId,
              {
                sourceEventId: delivery.sourceEventId,
                participantAttemptId: delivery.participantAttemptId,
                reason: delivery.reason,
                ...(delivery.expectedTurnId ? { expectedTurnId: delivery.expectedTurnId } : {}),
              },
              { signal: abortController.signal }
            ),
            PARTICIPANT_FAILURE_REQUEST_TIMEOUT_MS,
            () => abortController.abort()
          );
          delivery.state = "acked";
          participantFailureDeliveriesRef.current.delete(delivery.sourceEventId);
          refreshPendingFailureCount();
          if (
            callEpochRef.current !== delivery.callEpoch ||
            endingRef.current ||
            sessionRef.current?.id !== delivery.sessionId
          )
            return;
          setParticipants((current) => {
            const next: LocalParticipant[] = current.map((item) =>
              item.avatar.id === delivery.avatarId &&
              item.participantAttemptId === delivery.participantAttemptId &&
              result.participant.status === "errored"
                ? {
                    ...item,
                    clientStatus: "errored",
                    clientError: result.participant.error ?? "La conexión se cerró.",
                  }
                : item
            );
            participantsRef.current = next;
            if (next.length > 0 && next.every((item) => item.clientStatus === "errored")) {
              queueMicrotask(() => void endCallRef.current?.("no_participants"));
            }
            return next;
          });
          await reconcileServerResultRef.current(result);
        } catch (error) {
          if (
            delivery.state !== "pending" ||
            callEpochRef.current !== delivery.callEpoch ||
            endingRef.current
          )
            return;
          if (!isRetryableParticipantFailure(error)) {
            delivery.state = "cancelled";
            participantFailureDeliveriesRef.current.delete(delivery.sourceEventId);
            refreshPendingFailureCount();
            setCallError(error instanceof Error ? error.message : "No pudimos reconciliar al participante.");
            if (error instanceof ApiClientError && error.status === 401) router.push("/auth/login");
            void endCallRef.current?.("user");
            return;
          }
          delivery.attempt += 1;
          const delay =
            PARTICIPANT_FAILURE_RETRY_DELAYS_MS[
              Math.min(delivery.attempt, PARTICIPANT_FAILURE_RETRY_DELAYS_MS.length - 1)
            ] ?? 5_000;
          schedule(delay);
        }
      };

      schedule(PARTICIPANT_FAILURE_RETRY_DELAYS_MS[0]);
    },
    [
      applyAudioGate,
      refreshPendingFailureCount,
      releaseDisplayedFloor,
      renewFloorLease,
      router,
      setServerPhase,
    ]
  );

  const handleDirective = useCallback(
    async (directive: ApiGroupTurnDirective) => {
      if (directive.action === "suppress") {
        safelyInterruptLiveSession(liveSessionsRef.current.get(directive.avatarId)?.session);
        speakingAvatarIdsRef.current.delete(directive.avatarId);
        latestAvatarTextRef.current.delete(directive.avatarId);
        const authorization = floorAuthorizationRef.current;
        if (authorization?.avatarId === directive.avatarId) {
          const ledgerEntry = turnLedgerRef.current.get(authorization.turnId);
          if (ledgerEntry) ledgerEntry.state = "interrupted";
        }
        if (authorization?.avatarId === directive.avatarId) {
          releaseDisplayedFloor();
        } else {
          applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
        }
        return;
      }
      if (directive.action === "interrupt") {
        safelyInterruptLiveSession(liveSessionsRef.current.get(directive.avatarId)?.session);
        speakingAvatarIdsRef.current.delete(directive.avatarId);
        latestAvatarTextRef.current.delete(directive.avatarId);
        const authorization = floorAuthorizationRef.current;
        if (authorization?.avatarId === directive.avatarId) {
          const ledgerEntry = turnLedgerRef.current.get(authorization.turnId);
          if (ledgerEntry) ledgerEntry.state = "interrupted";
          releaseDisplayedFloor();
          setServerPhase("listening");
        } else {
          applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
        }
        return;
      }
      if (directive.action === "listen") {
        releaseDisplayedFloor();
        setServerPhase("listening");
        return;
      }
      if (endingRef.current) return;
      if (handledTurnIdsRef.current.has(directive.turnId)) return;
      const callEpoch = callEpochRef.current;
      const instance = liveSessionsRef.current.get(directive.avatarId);
      if (!instance) {
        const participant = participantsRef.current.find((item) => item.avatar.id === directive.avatarId);
        if (participant?.participantAttemptId) {
          enqueueParticipantFailure({
            avatarId: directive.avatarId,
            participantAttemptId: participant.participantAttemptId,
            generation: participantGenerationRef.current.get(directive.avatarId) ?? 0,
            sourceEventId: `missing-session:${directive.turnId}:${directive.avatarId}`,
            reason: "stream_error",
            expectedTurnId: directive.turnId,
          });
        }
        return;
      }

      handledTurnIdsRef.current.add(directive.turnId);
      pendingDirectiveRef.current = {
        turnId: directive.turnId,
        avatarId: directive.avatarId,
        callEpoch,
      };
      latestAvatarTextRef.current.delete(directive.avatarId);
      applyAudioGate(null);
      setTurnOwnerId(directive.avatarId);
      setServerPhase("queued");
      setPartialTranscript("");
      turnLedgerRef.current.set(directive.turnId, {
        turnId: directive.turnId,
        avatarId: directive.avatarId,
        callEpoch,
        state: "queued",
        originalResponse: null,
        latestResponse: null,
        responseReceived: false,
        responseKeys: new Set(),
      });
      pruneTurnLedger(turnLedgerRef.current, responseTurnIdRef.current);
      scheduleFloorExpiry({
        turnId: directive.turnId,
        avatarId: directive.avatarId,
        avatarName: directive.avatarName,
        leaseExpiresAt: directive.leaseExpiresAt,
        callEpoch,
      });

      try {
        await sendUserActivity({ floorOwnerAvatarId: directive.avatarId, force: true });
        await sendElevenLabsCommand(instance.session, "contextual_update", { text: directive.context });
        if (
          callEpochRef.current !== callEpoch ||
          endingRef.current ||
          sessionRef.current === null ||
          pendingDirectiveRef.current?.turnId !== directive.turnId ||
          pendingDirectiveRef.current.callEpoch !== callEpoch
        )
          return;
        pendingDirectiveRef.current = null;
        floorAuthorizationRef.current = {
          turnId: directive.turnId,
          avatarId: directive.avatarId,
          callEpoch,
          state: "queued",
        };
        applyAudioGate(directive.avatarId);
        await sendElevenLabsCommand(instance.session, "user_message", { text: directive.instruction });
      } catch (error) {
        applyAudioGate(null);
        enqueueParticipantFailure({
          avatarId: directive.avatarId,
          participantAttemptId: instance.participantAttemptId,
          generation: instance.generation,
          sourceEventId: `dispatch-failed:${directive.turnId}:${directive.avatarId}`,
          reason: "stream_error",
          expectedTurnId: directive.turnId,
        });
        setCallError(error instanceof Error ? error.message : "No pudimos preparar al participante.");
      }
    },
    [
      applyAudioGate,
      enqueueParticipantFailure,
      releaseDisplayedFloor,
      scheduleFloorExpiry,
      sendUserActivity,
      setServerPhase,
    ]
  );

  const reconcileExistingFloor = useCallback(
    (floor: ApiGroupFloorSnapshot) => {
      if (!isUsableFloorSnapshot(floor)) {
        releaseDisplayedFloor();
        return;
      }
      const authorization = floorAuthorizationRef.current;
      if (
        authorization?.turnId === floor.turnId &&
        authorization.avatarId === floor.avatarId &&
        authorization.callEpoch === callEpochRef.current
      ) {
        renewFloorLease(floor);
        setTurnOwnerId(authorization.avatarId);
        applyAudioGate(authorization.state === "committing" ? null : authorization.avatarId);
        return;
      }
      const pendingDirective = pendingDirectiveRef.current;
      if (
        pendingDirective?.turnId === floor.turnId &&
        pendingDirective.avatarId === floor.avatarId &&
        pendingDirective.callEpoch === callEpochRef.current
      ) {
        const avatarName =
          participantsRef.current.find((item) => item.avatar.id === floor.avatarId)?.avatar.name ??
          "El avatar";
        scheduleFloorExpiry({
          ...floor,
          avatarName,
          callEpoch: pendingDirective.callEpoch,
        });
        setTurnOwnerId(pendingDirective.avatarId);
        applyAudioGate(null);
        return;
      }
      releaseDisplayedFloor();
    },
    [applyAudioGate, releaseDisplayedFloor, renewFloorLease, scheduleFloorExpiry]
  );

  const reconcileServerResult = useCallback(
    async (result: ApiGroupOrchestrationResult) => {
      setServerPhase(result.phase);
      const directive = result.directive;
      if (directive?.action === "speak") {
        if (!speakDirectiveMatchesFloor(directive, result.floor)) {
          reconcileExistingFloor(result.floor);
          return;
        }
        await handleDirective({ ...directive, leaseExpiresAt: result.floor.leaseExpiresAt });
        return;
      }
      if (directive) {
        await handleDirective(directive);
        return;
      }
      if (result.phase === "listening" || result.phase === "ended" || result.phase === "errored") {
        releaseDisplayedFloor();
        return;
      }
      reconcileExistingFloor(result.floor);
    },
    [handleDirective, reconcileExistingFloor, releaseDisplayedFloor, setServerPhase]
  );

  reconcileServerResultRef.current = reconcileServerResult;

  const routeHumanTurn = useCallback(
    (input: { sourceEventId: string; content: string }) => {
      const sessionId = sessionRef.current?.id;
      if (
        !sessionId ||
        endingRef.current ||
        participantFailureDeliveriesRef.current.size > 0 ||
        participantRetryInFlightRef.current.size > 0
      )
        return;
      const callEpoch = callEpochRef.current;
      setServerPhase("deliberating");
      applyAudioGate(null);
      setPartialTranscript("");
      orchestrationQueueRef.current = orchestrationQueueRef.current
        .then(async () => {
          const result = await submitGroupTurn(sessionId, input);
          if (callEpochRef.current !== callEpoch || endingRef.current) return;
          await reconcileServerResult(result);
        })
        .catch((error) => {
          if (callEpochRef.current !== callEpoch) return;
          releaseDisplayedFloor();
          setServerPhase("listening");
          setCallError(error instanceof Error ? error.message : "No pudimos coordinar el siguiente turno.");
        });
    },
    [applyAudioGate, reconcileServerResult, releaseDisplayedFloor, setServerPhase]
  );

  const reportProviderEvent = useCallback(
    (
      input: Parameters<typeof reportGroupProviderEvent>[1],
      options: { affectsFloor?: boolean } = { affectsFloor: true }
    ) => {
      const sessionId = sessionRef.current?.id;
      if (!sessionId || endingRef.current) return;
      const callEpoch = callEpochRef.current;
      const participantInstance = liveSessionsRef.current.get(input.avatarId);
      const reportedEpisode = participantInstance
        ? {
            participantAttemptId: participantInstance.participantAttemptId,
            generation: participantInstance.generation,
          }
        : null;
      orchestrationQueueRef.current = orchestrationQueueRef.current
        .then(async () => {
          let result;
          try {
            result = await reportGroupProviderEvent(sessionId, input);
          } catch {
            result = await reportGroupProviderEvent(sessionId, input);
          }
          if (callEpochRef.current !== callEpoch || endingRef.current) return;
          providerEventDeliveryStateRef.current.set(input.sourceEventId, "acked");
          if (result.directive?.action === "suppress") {
            const currentInstance = liveSessionsRef.current.get(result.directive.avatarId);
            const authorization = floorAuthorizationRef.current;
            const pendingDirective = pendingDirectiveRef.current;
            const currentTurnId =
              authorization?.avatarId === result.directive.avatarId
                ? authorization.turnId
                : pendingDirective?.avatarId === result.directive.avatarId
                  ? pendingDirective.turnId
                  : null;
            const sameEpisode = Boolean(
              result.directive.avatarId === input.avatarId &&
              reportedEpisode &&
              currentInstance &&
              currentInstance.participantAttemptId === reportedEpisode.participantAttemptId &&
              currentInstance.generation === reportedEpisode.generation
            );
            if (!sameEpisode || currentTurnId !== input.turnId) return;
          }
          if (options.affectsFloor !== false) {
            await reconcileServerResult(result);
          }
        })
        .catch((error) => {
          if (callEpochRef.current !== callEpoch) return;
          providerEventDeliveryStateRef.current.set(input.sourceEventId, "failed");
          setCallError(error instanceof Error ? error.message : "No pudimos confirmar el turno del avatar.");
        });
    },
    [reconcileServerResult]
  );

  const startScribe = useCallback(async () => {
    const sessionId = sessionRef.current?.id;
    if (!sessionId || scribeRef.current || endingRef.current) return;
    const callEpoch = callEpochRef.current;
    const { scribe } = await getGroupScribeToken(sessionId);
    if (callEpochRef.current !== callEpoch || endingRef.current) return;
    const connection = Scribe.connect({
      token: scribe.token,
      modelId: "scribe_v2_realtime",
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: 0.9,
      minSpeechDurationMs: 180,
      minSilenceDurationMs: 120,
      microphone: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    const onPartialTranscript = (event: { text: string }) => {
      if (callEpochRef.current !== callEpoch) return;
      if (
        floorAuthorizationRef.current !== null ||
        turnPhaseRef.current !== "listening" ||
        participantFailureDeliveriesRef.current.size > 0 ||
        participantRetryInFlightRef.current.size > 0
      ) {
        setPartialTranscript("");
        return;
      }
      setPartialTranscript(event.text);
    };
    const onCommittedTranscript = (event: { text: string }) => {
      if (callEpochRef.current !== callEpoch) return;
      const content = event.text.trim();
      setPartialTranscript("");
      if (
        !content ||
        floorAuthorizationRef.current !== null ||
        turnPhaseRef.current !== "listening" ||
        participantFailureDeliveriesRef.current.size > 0 ||
        participantRetryInFlightRef.current.size > 0
      )
        return;
      const id = crypto.randomUUID();
      setTranscript((current) => [...current, { id, role: "user", speakerName: "Vos", content }]);
      routeHumanTurn({ sourceEventId: `scribe:${id}`, content });
    };
    const onError = (event: { error: string }) => {
      if (callEpochRef.current !== callEpoch) return;
      setCallError(event.error || "La transcripción en vivo se interrumpió.");
      if (scribeRef.current === connection) closeScribe();
    };
    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, onPartialTranscript);
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, onCommittedTranscript);
    connection.on(RealtimeEvents.ERROR, onError);
    scribeCleanupRef.current = () => {
      connection.off(RealtimeEvents.PARTIAL_TRANSCRIPT, onPartialTranscript);
      connection.off(RealtimeEvents.COMMITTED_TRANSCRIPT, onCommittedTranscript);
      connection.off(RealtimeEvents.ERROR, onError);
    };
    scribeRef.current = connection;
  }, [closeScribe, routeHumanTurn]);

  const initializeLiveParticipant = useCallback(
    async (participant: ApiGroupVoiceParticipant, callEpoch = callEpochRef.current) => {
      if (!participant.sessionToken || !participant.participantAttemptId) return false;
      const avatarId = participant.avatar.id;
      const participantAttemptId = participant.participantAttemptId;
      const generation = (participantGenerationRef.current.get(avatarId) ?? 0) + 1;
      participantGenerationRef.current.set(avatarId, generation);
      const existing = liveSessionsRef.current.get(avatarId);
      if (existing) {
        const existingElement = mediaElementsRef.current.get(avatarId);
        if (existingElement) existingElement.muted = true;
        detachLiveSessionListeners(avatarId, existing.generation);
        liveSessionsRef.current.delete(avatarId);
        startupCueFinishersRef.current.get(avatarId)?.finish();
        await stopLiveSessionBestEffort(existing.session);
      }

      const live = new LiveAvatarSession(participant.sessionToken, {
        voiceChat: { defaultMuted: true },
      });
      let resolveStartupCue: () => void = () => undefined;
      let startupCueFinished = false;
      const startupKey = `${callEpoch}:${generation}:${participantAttemptId}`;
      const startupCuePromise = new Promise<void>((resolve) => {
        resolveStartupCue = resolve;
      });
      const finishStartupCue = () => {
        if (startupCueFinished) return;
        startupCueFinished = true;
        const ownsStartup = startupPendingAvatarIdsRef.current.get(avatarId) === startupKey;
        if (ownsStartup) startupPendingAvatarIdsRef.current.delete(avatarId);
        const timeout = startupTimeoutsRef.current.get(avatarId);
        if (timeout?.startupKey === startupKey) {
          window.clearTimeout(timeout.timer);
          startupTimeoutsRef.current.delete(avatarId);
        }
        if (startupCueFinishersRef.current.get(avatarId)?.startupKey === startupKey) {
          startupCueFinishersRef.current.delete(avatarId);
        }
        if (ownsStartup && isCurrentCall()) {
          const authorization = floorAuthorizationRef.current;
          applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
        }
        resolveStartupCue();
      };
      const instance: LiveParticipantInstance = {
        session: live,
        participantAttemptId,
        generation,
        callEpoch,
      };
      const isCurrentCall = () => {
        const current = liveSessionsRef.current.get(avatarId);
        return (
          callEpochRef.current === callEpoch &&
          !endingRef.current &&
          current?.session === live &&
          current.generation === generation &&
          current.participantAttemptId === participantAttemptId
        );
      };
      const currentElement = mediaElementsRef.current.get(avatarId);
      if (currentElement) currentElement.muted = true;
      liveSessionsRef.current.set(avatarId, instance);
      startupPendingAvatarIdsRef.current.set(avatarId, startupKey);
      startupCueFinishersRef.current.set(avatarId, { startupKey, finish: finishStartupCue });

      const failCurrentInstance = (reason: "session_stopped" | "stream_error") => {
        if (!isCurrentCall()) return;
        finishStartupCue();
        detachLiveSessionListeners(avatarId, generation);
        liveSessionsRef.current.delete(avatarId);
        const element = mediaElementsRef.current.get(avatarId);
        if (element) element.muted = true;
        void live.stop().catch(() => undefined);
        const authorization = floorAuthorizationRef.current;
        enqueueParticipantFailure({
          avatarId,
          participantAttemptId,
          generation,
          sourceEventId: `participant-failure:${sessionRef.current?.id ?? "unknown"}:${avatarId}:${participantAttemptId}`,
          reason,
          ...(authorization?.avatarId === avatarId ? { expectedTurnId: authorization.turnId } : {}),
        });
      };

      const onStreamReady = () => {
        if (!isCurrentCall()) return;
        const element = mediaElementsRef.current.get(avatarId);
        if (element) {
          live.attach(element);
          const authorization = floorAuthorizationRef.current;
          applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
        }
      };
      const onSpeakStarted = (event: { event_id: string }) => {
        if (!isCurrentCall()) return;
        if (startupPendingAvatarIdsRef.current.get(avatarId) === startupKey) {
          const authorization = floorAuthorizationRef.current;
          applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
          return;
        }
        const authorization = floorAuthorizationRef.current;
        const logicalTurnId =
          authorization?.avatarId === avatarId &&
          authorization.callEpoch === callEpoch &&
          (authorization.state === "queued" || authorization.state === "speaking")
            ? authorization.turnId
            : null;
        const sourceEventId = providerEventSourceId({
          type: "speak_started",
          avatarId,
          providerEventId: logicalTurnId ? `turn:${logicalTurnId}` : event.event_id,
        });
        const deliveryState = providerEventDeliveryStateRef.current.get(sourceEventId);
        if (deliveryState === "inflight" || deliveryState === "acked") return;
        const isFailedAuthorizedRedelivery =
          deliveryState === "failed" &&
          authorization?.avatarId === avatarId &&
          authorization.callEpoch === callEpoch &&
          authorization.state === "speaking";
        if (
          !authorization ||
          (!isAuthorizedSpeechStart(authorization, avatarId, callEpoch) && !isFailedAuthorizedRedelivery)
        ) {
          if (!beginProviderEventDelivery(sourceEventId)) return;
          safelyInterruptLiveSession(live);
          speakingAvatarIdsRef.current.delete(avatarId);
          applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
          reportProviderEvent({
            sourceEventId,
            turnId: null,
            avatarId,
            type: "speak_started",
          });
          return;
        }
        if (!beginProviderEventDelivery(sourceEventId)) return;
        if (!isFailedAuthorizedRedelivery) authorization.state = "speaking";
        const ledgerEntry = turnLedgerRef.current.get(authorization.turnId);
        if (ledgerEntry) ledgerEntry.state = "speaking";
        speakingAvatarIdsRef.current.add(avatarId);
        applyAudioGate(avatarId);
        setActiveSpeakerId(avatarId);
        setServerPhase("speaking");
        setPartialTranscript("");
        reportProviderEvent({
          sourceEventId,
          turnId: authorization.turnId,
          avatarId,
          type: "speak_started",
        });
      };
      const onSpeakEnded = (event: { event_id: string }) => {
        if (!isCurrentCall()) return;
        if (startupPendingAvatarIdsRef.current.get(avatarId) === startupKey) {
          finishStartupCue();
          return;
        }
        const authorization = floorAuthorizationRef.current;
        const logicalTurnId =
          authorization?.avatarId === avatarId &&
          authorization.callEpoch === callEpoch &&
          (authorization.state === "speaking" || authorization.state === "committing")
            ? authorization.turnId
            : null;
        const sourceEventId = providerEventSourceId({
          type: "speak_ended",
          avatarId,
          providerEventId: logicalTurnId ? `turn:${logicalTurnId}` : event.event_id,
        });
        const deliveryState = providerEventDeliveryStateRef.current.get(sourceEventId);
        if (deliveryState === "inflight" || deliveryState === "acked") return;
        const isFailedAuthorizedRedelivery =
          deliveryState === "failed" &&
          authorization?.avatarId === avatarId &&
          authorization.callEpoch === callEpoch &&
          authorization.state === "committing";
        if (
          !authorization ||
          (!isAuthorizedSpeechEnd(authorization, avatarId, callEpoch) && !isFailedAuthorizedRedelivery)
        )
          return;
        if (!beginProviderEventDelivery(sourceEventId)) return;
        applyAudioGate(null);
        if (!isFailedAuthorizedRedelivery) authorization.state = "committing";
        const ledgerEntry = turnLedgerRef.current.get(authorization.turnId);
        if (ledgerEntry) ledgerEntry.state = "completed";
        speakingAvatarIdsRef.current.delete(avatarId);
        setActiveSpeakerId((current) => (current === avatarId ? null : current));
        setServerPhase("committing");
        const content = ledgerEntry?.latestResponse ?? latestAvatarTextRef.current.get(avatarId);
        if (content && !committedTranscriptTurnIdsRef.current.has(authorization.turnId)) {
          committedTranscriptTurnIdsRef.current.add(authorization.turnId);
          setTranscript((current) => [
            ...current,
            {
              id: `assistant:${authorization.turnId}`,
              role: "assistant",
              speakerName: participant.avatar.name,
              content,
            },
          ]);
        }
        reportProviderEvent({
          sourceEventId,
          turnId: authorization.turnId,
          avatarId,
          type: "speak_ended",
          ...(content ? { content } : {}),
        });
      };
      const onAvatarTranscription = (event: { event_id: string; text: string }) => {
        if (!isCurrentCall()) return;
        const content = event.text.trim();
        const authorization = floorAuthorizationRef.current;
        if (
          !content ||
          !authorization ||
          authorization.avatarId !== avatarId ||
          authorization.callEpoch !== callEpoch ||
          !speakingAvatarIdsRef.current.has(avatarId)
        )
          return;
        latestAvatarTextRef.current.set(avatarId, content);
        const ledgerEntry = turnLedgerRef.current.get(authorization.turnId);
        if (ledgerEntry && !ledgerEntry.latestResponse) ledgerEntry.latestResponse = content;
      };
      const onElevenLabsAgentEvent = (event: {
        event_id: string;
        elevenlabs_event_type: string;
        data: Record<string, unknown>;
      }) => {
        if (!isCurrentCall()) return;
        if (
          event.elevenlabs_event_type === "agent_response" ||
          event.elevenlabs_event_type === "agent_response_correction"
        ) {
          const response = parseElevenLabsResponse(event.data);
          if (!response) return;
          const type = event.elevenlabs_event_type;
          const turnId = resolveTurnForAgentResponse({
            avatarId,
            callEpoch,
            type,
            response,
            authorization: floorAuthorizationRef.current,
            ledger: turnLedgerRef.current,
            responseTurnIds: responseTurnIdRef.current,
          });
          if (!turnId) return;
          const sourceEventId = providerEventSourceId({
            type,
            avatarId,
            providerEventId: event.event_id,
          });
          if (!beginProviderEventDelivery(sourceEventId)) return;
          const ledgerEntry = turnLedgerRef.current.get(turnId);
          if (!ledgerEntry) return;
          if (!ledgerEntry.originalResponse) {
            ledgerEntry.originalResponse = response.originalText ?? response.text;
          }
          ledgerEntry.latestResponse = response.text;
          ledgerEntry.responseReceived = true;
          for (const key of response.responseKeys) {
            const scopedKey = `${avatarId}:${key}`;
            ledgerEntry.responseKeys.add(scopedKey);
            responseTurnIdRef.current.set(scopedKey, turnId);
          }
          if (floorAuthorizationRef.current?.turnId === turnId) {
            latestAvatarTextRef.current.set(avatarId, response.text);
          }
          if (committedTranscriptTurnIdsRef.current.has(turnId)) {
            setTranscript((current) =>
              current.map((entry) =>
                entry.id === `assistant:${turnId}` ? { ...entry, content: response.text } : entry
              )
            );
          } else if (ledgerEntry.state === "completed") {
            committedTranscriptTurnIdsRef.current.add(turnId);
            setTranscript((current) => [
              ...current,
              {
                id: `assistant:${turnId}`,
                role: "assistant",
                speakerName: participant.avatar.name,
                content: response.text,
              },
            ]);
          }
          reportProviderEvent(
            { sourceEventId, turnId, avatarId, type, content: response.text },
            { affectsFloor: false }
          );
          return;
        }
        if (event.elevenlabs_event_type !== "interruption") return;
        const authorization = floorAuthorizationRef.current;
        if (!authorization || authorization.avatarId !== avatarId || authorization.callEpoch !== callEpoch)
          return;
        const sourceEventId = providerEventSourceId({
          type: "interruption",
          avatarId,
          providerEventId: event.event_id,
        });
        const deliveryState = providerEventDeliveryStateRef.current.get(sourceEventId);
        const isFailedAuthorizedRedelivery =
          deliveryState === "failed" && authorization.state === "committing";
        if (authorization.state !== "speaking" && !isFailedAuthorizedRedelivery) return;
        if (!beginProviderEventDelivery(sourceEventId)) return;
        applyAudioGate(null);
        if (!isFailedAuthorizedRedelivery) authorization.state = "committing";
        const ledgerEntry = turnLedgerRef.current.get(authorization.turnId);
        if (ledgerEntry) ledgerEntry.state = "interrupted";
        reportProviderEvent({
          sourceEventId,
          turnId: authorization.turnId,
          avatarId,
          type: "interruption",
        });
      };
      const onSessionStopped = () => failCurrentInstance("session_stopped");
      const onSessionDisconnected = () => failCurrentInstance("stream_error");

      live.on(SessionEvent.SESSION_STREAM_READY, onStreamReady);
      live.on(SessionEvent.SESSION_DISCONNECTED, onSessionDisconnected);
      live.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, onSpeakStarted);
      live.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, onSpeakEnded);
      live.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, onAvatarTranscription);
      live.on(AgentEventsEnum.ELEVENLABS_AGENT_EVENT, onElevenLabsAgentEvent);
      live.on(AgentEventsEnum.SESSION_STOPPED, onSessionStopped);
      liveSessionCleanupRef.current.set(avatarId, {
        generation,
        cleanup: () => {
          live.off(SessionEvent.SESSION_STREAM_READY, onStreamReady);
          live.off(SessionEvent.SESSION_DISCONNECTED, onSessionDisconnected);
          live.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, onSpeakStarted);
          live.off(AgentEventsEnum.AVATAR_SPEAK_ENDED, onSpeakEnded);
          live.off(AgentEventsEnum.AVATAR_TRANSCRIPTION, onAvatarTranscription);
          live.off(AgentEventsEnum.ELEVENLABS_AGENT_EVENT, onElevenLabsAgentEvent);
          live.off(AgentEventsEnum.SESSION_STOPPED, onSessionStopped);
        },
      });

      const startPromise = live.start();
      try {
        await withTimeout(startPromise, LIVE_PARTICIPANT_START_TIMEOUT_MS, isCurrentCall);
        if (!isCurrentCall()) {
          detachLiveSessionListeners(avatarId, generation);
          if (liveSessionsRef.current.get(avatarId)?.generation === generation) {
            liveSessionsRef.current.delete(avatarId);
          }
          await stopLiveSessionBestEffort(live);
          return false;
        }
        const element = mediaElementsRef.current.get(avatarId);
        if (element) {
          element.muted = true;
          live.attach(element);
        }
        const authorization = floorAuthorizationRef.current;
        applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
        if (!startupCueFinished) {
          const startupTimeout = window.setTimeout(finishStartupCue, 4_000);
          startupTimeoutsRef.current.set(avatarId, { startupKey, timer: startupTimeout });
        }
        await startupCuePromise;
        if (!isCurrentCall()) return false;
        setParticipants((current) => {
          const next = current.map(
            (item): LocalParticipant =>
              item.avatar.id === avatarId && item.participantAttemptId === participantAttemptId
                ? { ...item, clientStatus: "active", clientError: null }
                : item
          );
          participantsRef.current = next;
          return next;
        });
        return true;
      } catch {
        finishStartupCue();
        if (isCurrentCall()) {
          detachLiveSessionListeners(avatarId, generation);
          liveSessionsRef.current.delete(avatarId);
          enqueueParticipantFailure({
            avatarId,
            participantAttemptId,
            generation,
            sourceEventId: `participant-failure:${sessionRef.current?.id ?? "unknown"}:${avatarId}:${participantAttemptId}`,
            reason: "stream_error",
          });
        }
        void live.stop().catch(() => undefined);
        void startPromise.then(() => live.stop()).catch(() => undefined);
        return false;
      }
    },
    [
      applyAudioGate,
      beginProviderEventDelivery,
      detachLiveSessionListeners,
      enqueueParticipantFailure,
      reportProviderEvent,
      setServerPhase,
    ]
  );

  const endCall = useCallback(
    async (reason: "user" | "timeout" | "no_participants" | "unload" = "user") => {
      const activeSession = sessionRef.current;
      if (endingRef.current) return;
      endingRef.current = true;
      startRequestTokenRef.current += 1;
      startingRef.current = false;
      heartbeatInFlightRef.current = false;
      callEpochRef.current += 1;
      orchestrationQueueRef.current = Promise.resolve();
      applyAudioGate(null);
      setCallStatus("ending");
      if (expiryTimeoutRef.current !== null) {
        window.clearTimeout(expiryTimeoutRef.current);
        expiryTimeoutRef.current = null;
      }
      const serverEnd = activeSession ? endGroupVoiceSession(activeSession.id, reason) : null;
      closeScribe();
      clearParticipantFailureDeliveries();
      for (const finisher of startupCueFinishersRef.current.values()) finisher.finish();
      startupCueFinishersRef.current.clear();
      for (const avatarId of liveSessionsRef.current.keys()) detachLiveSessionListeners(avatarId);
      await Promise.allSettled(
        [...liveSessionsRef.current.values()].map((instance) => stopLiveSessionBestEffort(instance.session))
      );
      liveSessionsRef.current.clear();
      for (const timeout of startupTimeoutsRef.current.values()) window.clearTimeout(timeout.timer);
      startupTimeoutsRef.current.clear();
      startupPendingAvatarIdsRef.current.clear();
      clearTurnTimeout();
      floorAuthorizationRef.current = null;
      pendingDirectiveRef.current = null;
      speakingAvatarIdsRef.current.clear();
      latestAvatarTextRef.current.clear();
      committedTranscriptTurnIdsRef.current.clear();
      handledTurnIdsRef.current.clear();
      providerEventDeliveryStateRef.current.clear();
      participantGenerationRef.current.clear();
      participantRetryInFlightRef.current.clear();
      setPendingRetryCount(0);
      turnLedgerRef.current.clear();
      responseTurnIdRef.current.clear();
      try {
        if (serverEnd) await serverEnd;
        setCallStatus("ended");
        if (serverEnd) void loadHistory();
      } catch (error) {
        setCallStatus("error");
        setCallError(error instanceof Error ? error.message : "No pudimos cerrar la llamada.");
      } finally {
        sessionRef.current = null;
        setActiveSpeakerId(null);
        setTurnOwnerId(null);
        setAudibleOwnerId(null);
        setServerPhase("listening");
      }
    },
    [
      applyAudioGate,
      clearParticipantFailureDeliveries,
      clearTurnTimeout,
      closeScribe,
      detachLiveSessionListeners,
      loadHistory,
      setServerPhase,
    ]
  );

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  async function requestGroupCallStart() {
    if (!canStart) return;
    const requestToken = ++startRequestTokenRef.current;
    const isCurrentRequest = () =>
      mountedRef.current && startRequestTokenRef.current === requestToken && !startingRef.current;
    const sharedMembers = group?.members.filter(
      (member) => member.available && member.accessType === "shared"
    );
    if (!sharedMembers || sharedMembers.length === 0) {
      if (isCurrentRequest()) await startCall();
      return;
    }

    const names = sharedMembers.map((member) => member.name);
    try {
      const { user } = await getMe();
      if (!isCurrentRequest()) return;
      const storageKeys = sharedMembers.map((member) => getSharedCallConsentStorageKey(user.id, member.id));
      if (storageKeys.every(readRememberedPrivacyChoice)) {
        await startCall();
        return;
      }
      setPrivacyStorageKeys(storageKeys);
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (error instanceof ApiClientError && error.status === 401) {
        router.push("/auth/login");
        return;
      }
      setPrivacyStorageKeys([]);
    }
    if (!isCurrentRequest()) return;
    setPrivacyAvatarNames(names);
    setRememberPrivacyChoice(false);
    privacyDialog.current?.showModal();
  }

  function confirmGroupCallStart() {
    if (rememberPrivacyChoice) {
      for (const storageKey of privacyStorageKeys) rememberPrivacyChoiceForAvatar(storageKey);
    }
    privacyDialog.current?.close();
    setPrivacyAvatarNames([]);
    void startCall();
  }

  async function startCall() {
    if (!mountedRef.current || startingRef.current || callStatus === "active" || callStatus === "degraded")
      return;
    startRequestTokenRef.current += 1;
    startingRef.current = true;
    heartbeatInFlightRef.current = false;
    setCallStatus("starting");
    callEpochRef.current += 1;
    const callEpoch = callEpochRef.current;
    orchestrationQueueRef.current = Promise.resolve();
    applyAudioGate(null);
    setCallError(null);
    setTranscript([]);
    setIsMuted(false);
    setTurnOwnerId(null);
    setServerPhase("listening");
    floorAuthorizationRef.current = null;
    pendingDirectiveRef.current = null;
    speakingAvatarIdsRef.current.clear();
    latestAvatarTextRef.current.clear();
    committedTranscriptTurnIdsRef.current.clear();
    handledTurnIdsRef.current.clear();
    providerEventDeliveryStateRef.current.clear();
    participantGenerationRef.current.clear();
    participantRetryInFlightRef.current.clear();
    setPendingRetryCount(0);
    turnLedgerRef.current.clear();
    responseTurnIdRef.current.clear();
    clearParticipantFailureDeliveries();
    for (const finisher of startupCueFinishersRef.current.values()) finisher.finish();
    startupCueFinishersRef.current.clear();
    for (const timeout of startupTimeoutsRef.current.values()) window.clearTimeout(timeout.timer);
    startupTimeoutsRef.current.clear();
    startupPendingAvatarIdsRef.current.clear();
    clearTurnTimeout();
    endingRef.current = false;
    try {
      const { voiceSession } = await startGroupVoiceSession(groupId);
      if (callEpochRef.current !== callEpoch || endingRef.current) {
        await endGroupVoiceSession(voiceSession.id, "unload").catch(() => undefined);
        return;
      }
      sessionRef.current = voiceSession;
      const expiresInMs = Math.max(0, new Date(voiceSession.expiresAt).getTime() - Date.now());
      expiryTimeoutRef.current = window.setTimeout(() => void endCallRef.current?.("timeout"), expiresInMs);
      const local = voiceSession.participants.map((participant) => {
        const canConnect = Boolean(
          participant.status === "active" && participant.participantAttemptId && participant.sessionToken
        );
        return {
          ...participant,
          clientStatus: canConnect ? ("connecting" as const) : ("errored" as const),
          clientError:
            participant.error ??
            (canConnect ? null : "El servidor no confirmó un intento activo para este participante."),
        };
      });
      setParticipants(local);
      participantsRef.current = local;
      const connected = await Promise.all(
        voiceSession.participants
          .filter((participant) => participant.status === "active")
          .map((participant) => initializeLiveParticipant(participant, callEpoch))
      );
      if (callEpochRef.current !== callEpoch || endingRef.current) return;
      const connectedCount = connected.filter(Boolean).length;
      if (connectedCount === 0) {
        throw new Error("No pudimos conectar ningún video de la llamada.");
      }
      await startScribe();
      setCallStatus(
        voiceSession.status === "degraded" || connectedCount < voiceSession.participants.length
          ? "degraded"
          : "active"
      );
    } catch (error) {
      if (callEpochRef.current !== callEpoch) return;
      setCallError(error instanceof Error ? error.message : "No pudimos iniciar la llamada grupal.");
      if (sessionRef.current) await endCall("no_participants");
      setCallStatus("error");
    } finally {
      if (callEpochRef.current === callEpoch) startingRef.current = false;
    }
  }

  async function retryParticipant(avatarId: string) {
    const activeSession = sessionRef.current;
    if (!activeSession || participantRetryInFlightRef.current.has(avatarId)) return;
    const callEpoch = callEpochRef.current;
    const sessionId = activeSession.id;
    const retryToken = `${sessionId}:${callEpoch}:${crypto.randomUUID()}`;
    participantRetryInFlightRef.current.set(avatarId, retryToken);
    setPendingRetryCount(participantRetryInFlightRef.current.size);
    setParticipants((current) => {
      const next: LocalParticipant[] = current.map((item) =>
        item.avatar.id === avatarId ? { ...item, clientStatus: "connecting", clientError: null } : item
      );
      participantsRef.current = next;
      return next;
    });
    try {
      const { participant } = await retryGroupParticipant(sessionId, avatarId);
      if (endingRef.current || callEpochRef.current !== callEpoch || sessionRef.current?.id !== sessionId)
        return;
      if (!participant.participantAttemptId || !participant.sessionToken) {
        throw new Error("El servidor no confirmó un nuevo intento para este participante.");
      }
      setParticipants((current) => {
        const next: LocalParticipant[] = current.map((item) =>
          item.avatar.id === avatarId
            ? { ...participant, clientStatus: "connecting", clientError: null }
            : item
        );
        participantsRef.current = next;
        return next;
      });
      const connected = await initializeLiveParticipant(participant, callEpoch);
      if (
        !connected ||
        endingRef.current ||
        callEpochRef.current !== callEpoch ||
        sessionRef.current?.id !== sessionId
      )
        return;
      if (
        participantsRef.current.every((item) => item.avatar.id === avatarId || item.clientStatus === "active")
      ) {
        setCallStatus("active");
      }
    } catch (error) {
      if (endingRef.current || callEpochRef.current !== callEpoch || sessionRef.current?.id !== sessionId)
        return;
      setParticipants((current) => {
        const next: LocalParticipant[] = current.map((item) =>
          item.avatar.id === avatarId
            ? {
                ...item,
                clientStatus: "errored",
                clientError: error instanceof Error ? error.message : "No pudimos reconectar.",
              }
            : item
        );
        participantsRef.current = next;
        return next;
      });
    } finally {
      if (participantRetryInFlightRef.current.get(avatarId) === retryToken) {
        participantRetryInFlightRef.current.delete(avatarId);
        setPendingRetryCount(participantRetryInFlightRef.current.size);
      }
    }
  }

  async function toggleMute() {
    if (
      floorAuthorizationRef.current !== null ||
      turnPhaseRef.current !== "listening" ||
      participantRetryInFlightRef.current.size > 0
    )
      return;
    if (isMuted) {
      setCallError(null);
      try {
        await startScribe();
        setIsMuted(false);
      } catch (error) {
        setCallError(error instanceof Error ? error.message : "No pudimos activar el micrófono.");
      }
    } else {
      closeScribe();
      setIsMuted(true);
      setPartialTranscript("");
    }
  }

  async function interruptCurrentAvatar() {
    const directive = floorAuthorizationRef.current;
    const activeSessionId = sessionRef.current?.id;
    if (!directive || !activeSessionId) return;
    try {
      const result = await interruptGroupVoiceSession(activeSessionId, "user", {
        avatarId: directive.avatarId,
        turnId: directive.turnId,
      });
      safelyInterruptLiveSession(liveSessionsRef.current.get(directive.avatarId)?.session);
      speakingAvatarIdsRef.current.delete(directive.avatarId);
      latestAvatarTextRef.current.delete(directive.avatarId);
      await reconcileServerResult(result);
      setCallError(null);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "No pudimos interrumpir al avatar.");
    }
  }

  function toggleHistory() {
    setIsHistoryOpen((current) => !current);
    if (!isHistoryOpen && historyState.summariesStatus === "idle") {
      void loadHistory();
    }
  }

  const getMediaRefCallback = useCallback((avatarId: string) => {
    const existing = mediaRefCallbacksRef.current.get(avatarId);
    if (existing) return existing;
    const callback = (element: HTMLVideoElement | null) => {
      if (!element) {
        mediaElementsRef.current.delete(avatarId);
        return;
      }
      mediaElementsRef.current.set(avatarId, element);
      element.muted = avatarId !== audibleOwnerRef.current;
      liveSessionsRef.current.get(avatarId)?.session.attach(element);
      applyGroupAudioGate(mediaElementsRef.current, audibleOwnerRef.current);
    };
    mediaRefCallbacksRef.current.set(avatarId, callback);
    return callback;
  }, []);

  useEffect(() => {
    if (callStatus !== "active" && callStatus !== "degraded") return;
    const heartbeatInterval = window.setInterval(() => {
      const sessionId = sessionRef.current?.id;
      if (!sessionId || heartbeatInFlightRef.current) return;
      const callEpoch = callEpochRef.current;
      heartbeatInFlightRef.current = true;
      void heartbeatGroupVoiceSession(sessionId)
        .catch((error) => {
          if (
            callEpochRef.current !== callEpoch ||
            sessionRef.current?.id !== sessionId ||
            !isTerminalHeartbeatError(error)
          )
            return;
          applyAudioGate(null);
          setCallError(error instanceof Error ? error.message : "La sesión grupal ya no está disponible.");
          if (error instanceof ApiClientError && error.status === 401) router.push("/auth/login");
          void endCallRef.current?.("unload");
        })
        .finally(() => {
          if (callEpochRef.current === callEpoch) heartbeatInFlightRef.current = false;
        });
    }, 20_000);
    const activityInterval = window.setInterval(() => {
      void sendUserActivity();
    }, 20_000);
    const liveAvatarKeepAliveInterval = window.setInterval(() => {
      for (const instance of liveSessionsRef.current.values()) {
        void instance.session.keepAlive().catch(() => undefined);
      }
    }, 120_000);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const authorization = floorAuthorizationRef.current;
      applyAudioGate(authorization?.state === "committing" ? null : (authorization?.avatarId ?? null));
      void sendUserActivity();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(heartbeatInterval);
      window.clearInterval(activityInterval);
      window.clearInterval(liveAvatarKeepAliveInterval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applyAudioGate, callStatus, router, sendUserActivity]);

  useEffect(() => {
    const onPageHide = () => {
      if (sessionRef.current && !endingRef.current) void endCall("unload");
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      if (sessionRef.current && !endingRef.current) {
        void endCall("unload");
      } else {
        callEpochRef.current += 1;
        closeScribe();
        applyAudioGate(null);
      }
    };
  }, [applyAudioGate, closeScribe, endCall]);

  if (loadStatus === "loading") {
    return <LoadingState title="Cargando grupo" description="Estamos preparando la sala." />;
  }
  if (loadStatus === "error" || !group) {
    return (
      <ErrorState
        title="No pudimos abrir el grupo"
        description={callError ?? "El grupo no está disponible."}
        action={<Button onClick={() => router.push("/groups")}>Volver a grupos</Button>}
      />
    );
  }

  const baseParticipants =
    participants.length > 0
      ? participants
      : group.members.map((member) => ({
          id: member.id,
          participantAttemptId: null,
          avatar: member,
          realtimeSessionId: "",
          status: "active" as const,
          sessionToken: null,
          sessionId: null,
          error: null,
          clientStatus: member.available ? ("connecting" as const) : ("errored" as const),
          clientError: member.available ? null : "Este avatar ya no está disponible.",
        }));
  const memberPosition = new Map(group.members.map((member) => [member.id, member.position]));
  const availableMemberIds = new Set(
    group.members.filter((member) => member.available).map((member) => member.id)
  );
  const displayedParticipants = [...baseParticipants].sort(
    (left, right) =>
      (memberPosition.get(left.avatar.id) ?? Number.MAX_SAFE_INTEGER) -
      (memberPosition.get(right.avatar.id) ?? Number.MAX_SAFE_INTEGER)
  );
  const isLive = callStatus === "active" || callStatus === "degraded";
  const canUserSpeak =
    isLive &&
    pendingFailureCount === 0 &&
    pendingRetryCount === 0 &&
    turnOwnerId === null &&
    turnPhase === "listening";
  const canStart =
    availableMemberIds.size >= 2 &&
    (callStatus === "idle" || callStatus === "ended" || callStatus === "error");
  const turnOwnerName = displayedParticipants.find((item) => item.avatar.id === turnOwnerId)?.avatar.name;

  return (
    <CallExperienceShell
      backLabel="Grupos"
      onBack={() => router.push("/groups")}
      eyebrow="Llamada grupal"
      title={group.name}
      description={
        isLive
          ? "La conversación está coordinada automáticamente."
          : `${availableMemberIds.size} participantes listos para conversar.`
      }
      isHistoryOpen={isHistoryOpen}
      onCloseHistory={() => setIsHistoryOpen(false)}
      actions={
        <Button
          variant="ghost"
          icon={<YuniIcon name="history" />}
          aria-controls="call-history-panel"
          aria-expanded={isHistoryOpen}
          onClick={toggleHistory}
        >
          Historial
        </Button>
      }
      historyContent={
        <InteractConversationHistoryPanel
          avatarName={group.name}
          summaries={historyState.summaries}
          summariesStatus={historyState.summariesStatus}
          summariesError={historyState.summariesError}
          selectedConversationId={historyState.selectedConversationId}
          detail={historyState.detail}
          detailStatus={historyState.detailStatus}
          detailError={historyState.detailError}
          onRefresh={() => void loadHistory()}
          onSelectConversation={loadConversation}
        />
      }
      footer={
        group.members.some((member) => member.accessType === "shared") ? (
          <SharedCallPrivacyDialog
            ref={privacyDialog}
            sharedAvatarNames={privacyAvatarNames}
            rememberChoice={rememberPrivacyChoice}
            onRememberChoiceChange={setRememberPrivacyChoice}
            onConfirm={confirmGroupCallStart}
            onCancel={() => {
              setRememberPrivacyChoice(false);
              setPrivacyStorageKeys([]);
              setPrivacyAvatarNames([]);
            }}
          />
        ) : null
      }
    >
      <CallParticipantStage
        label={`Llamada con ${group.name}`}
        participants={displayedParticipants.map((participant) => {
          const isSpeaker = activeSpeakerId === participant.avatar.id;
          const ownsTurn = turnOwnerId === participant.avatar.id;
          const visibleStatus =
            callStatus !== "starting" && !isLive && availableMemberIds.has(participant.avatar.id)
              ? "ready"
              : participant.clientStatus === "errored"
                ? "errored"
                : participant.clientStatus === "active"
                  ? "active"
                  : "connecting";
          return {
            id: participant.avatar.id,
            name: participant.avatar.name,
            status: visibleStatus,
            statusLabel:
              visibleStatus === "ready"
                ? "Listo"
                : turnPhase === "deliberating"
                  ? "Analizando"
                  : participantTurnLabel({
                      participant,
                      isSpeaker,
                      ownsTurn,
                      isLive,
                      anotherAvatarHasTurn: turnOwnerId !== null && !ownsTurn,
                    }),
            mediaMuted: audibleOwnerId !== participant.avatar.id,
            isSpeaking: isSpeaker,
            ownsTurn,
            error: visibleStatus === "errored" ? participant.clientError : null,
            placeholderTitle:
              visibleStatus === "connecting"
                ? "Conectando con el avatar"
                : visibleStatus === "errored"
                  ? "Sin conexión"
                  : "Listo para llamar",
            ...(visibleStatus === "ready"
              ? { placeholderDescription: "Se conectará cuando inicies la llamada." }
              : {}),
            attachMediaElement: getMediaRefCallback(participant.avatar.id),
            ...(visibleStatus === "errored" && isLive
              ? { onRetry: () => void retryParticipant(participant.avatar.id) }
              : {}),
          };
        })}
        badges={
          <>
            <Badge tone={isLive ? "success" : callStatus === "error" ? "danger" : "neutral"}>
              {formatGroupCallStatus(callStatus)}
            </Badge>
            <Badge
              tone={turnPhase === "speaking" ? "success" : turnPhase === "listening" ? "warning" : "neutral"}
            >
              {formatTurnPhase(turnPhase)}
            </Badge>
            <Badge tone="neutral">{displayedParticipants.length} participantes</Badge>
          </>
        }
        dock={
          <>
            {callError ? (
              <p className={styles.inlineError} role="alert">
                {callError}
              </p>
            ) : null}
            {partialTranscript ? (
              <p className={styles.liveCaption} aria-live="polite">
                Vos: {partialTranscript}
              </p>
            ) : null}
            {isLive ? (
              <p className={styles.turnIndicator} aria-live="polite">
                {turnStatusLabel(turnPhase, turnOwnerName, isMuted)}
              </p>
            ) : null}
            <InteractCallControls
              status={callStatus}
              isMuted={isMuted}
              canStart={canStart}
              isActive={isLive || callStatus === "starting"}
              canToggleMute={canUserSpeak}
              canInterrupt={false}
              onStart={() => void requestGroupCallStart()}
              onToggleMute={() => void toggleMute()}
              onInterrupt={() => void interruptCurrentAvatar()}
              onEnd={() => void endCall("user")}
            />
          </>
        }
      />
    </CallExperienceShell>
  );
}

async function sendElevenLabsCommand(
  session: LiveAvatarSession,
  elevenlabsEventType: ElevenLabsCommandType,
  data: Record<string, string> = {}
) {
  const room = (
    session as unknown as {
      room?: {
        localParticipant?: {
          publishData?: (
            data: Uint8Array,
            options: { reliable: boolean; topic: string }
          ) => Promise<void> | void;
        };
      };
    }
  ).room;
  if (!room?.localParticipant?.publishData) throw new Error("El canal del avatar todavía no está listo.");
  await room.localParticipant.publishData(encodeElevenLabsAgentCommand(elevenlabsEventType, data), {
    reliable: true,
    topic: "agent-control",
  });
}

function safelyInterruptLiveSession(session: LiveAvatarSession | undefined) {
  try {
    session?.interrupt();
  } catch {
    // The browser audio gate is authoritative for audibility; a provider-side
    // interrupt failure must not break the valid floor or the orchestration queue.
  }
}

function parseElevenLabsResponse(value: unknown): ParsedElevenLabsResponse | null {
  const text = findNestedString(value, ["corrected_agent_response", "agent_response", "text", "response"]);
  if (!text) return null;
  return {
    text,
    originalText: findNestedString(value, ["original_agent_response"]),
    responseKeys: collectNestedStringValues(value, ["response_id", "event_id"]),
  };
}

function findNestedString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const nested of Object.values(record)) {
    const candidate = findNestedString(nested, keys);
    if (candidate) return candidate;
  }
  return null;
}

function collectNestedStringValues(value: unknown, keys: string[]) {
  const values = new Set<string>();
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    const record = candidate as Record<string, unknown>;
    for (const [key, nested] of Object.entries(record)) {
      if (keys.includes(key) && typeof nested === "string" && nested.trim()) values.add(nested.trim());
      visit(nested);
    }
  };
  visit(value);
  return [...values];
}

function resolveTurnForAgentResponse(input: {
  avatarId: string;
  callEpoch: number;
  type: "agent_response" | "agent_response_correction";
  response: ParsedElevenLabsResponse;
  authorization: LocalFloorAuthorization | null;
  ledger: Map<string, LocalTurnLedgerEntry>;
  responseTurnIds: Map<string, string>;
}) {
  for (const key of input.response.responseKeys) {
    const turnId = input.responseTurnIds.get(`${input.avatarId}:${key}`);
    if (turnId) return turnId;
  }

  const candidates = [...input.ledger.values()].filter(
    (entry) => entry.avatarId === input.avatarId && entry.callEpoch === input.callEpoch
  );
  if (input.type === "agent_response_correction") {
    if (!input.response.originalText) return null;
    const originalMatches = candidates.filter(
      (entry) =>
        entry.originalResponse === input.response.originalText ||
        entry.latestResponse === input.response.originalText
    );
    return originalMatches.length === 1 ? (originalMatches[0]?.turnId ?? null) : null;
  }

  if (
    input.authorization?.avatarId === input.avatarId &&
    input.authorization.callEpoch === input.callEpoch &&
    input.ledger.has(input.authorization.turnId)
  ) {
    return input.authorization.turnId;
  }

  const unmatched = candidates.filter((entry) => !entry.responseReceived);
  return unmatched.length === 1 ? (unmatched[0]?.turnId ?? null) : null;
}

function pruneTurnLedger(ledger: Map<string, LocalTurnLedgerEntry>, responseTurnIds: Map<string, string>) {
  while (ledger.size > MAX_TURN_LEDGER_ENTRIES) {
    const removable = [...ledger.values()].find(
      (entry) => entry.state === "completed" || entry.state === "interrupted"
    );
    const oldest = removable ?? ledger.values().next().value;
    if (!oldest) return;
    ledger.delete(oldest.turnId);
    for (const key of oldest.responseKeys) responseTurnIds.delete(key);
  }
}

function speakDirectiveMatchesFloor(
  directive: Extract<ApiGroupTurnDirective, { action: "speak" }>,
  floor: ApiGroupFloorSnapshot
): floor is Exclude<ApiGroupFloorSnapshot, null> {
  return (
    isUsableFloorSnapshot(floor) && floor.turnId === directive.turnId && floor.avatarId === directive.avatarId
  );
}

function isUsableFloorSnapshot(floor: ApiGroupFloorSnapshot): floor is Exclude<ApiGroupFloorSnapshot, null> {
  if (!floor?.leaseExpiresAt.trim()) return false;
  const leaseExpiresAt = new Date(floor.leaseExpiresAt).getTime();
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, isCurrent: () => boolean) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          isCurrent()
            ? "La conexión con el avatar tardó demasiado."
            : "El intento de conexión ya no está vigente."
        )
      );
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        if (isCurrent()) resolve(value);
        else reject(new Error("El intento de conexión ya no está vigente."));
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function withAbortableDeadline<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      onTimeout();
      reject(new Error("La confirmación del fallo del participante agotó el tiempo de espera."));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

async function stopLiveSessionBestEffort(session: LiveAvatarSession) {
  let stopPromise: Promise<unknown>;
  try {
    stopPromise = Promise.resolve(session.stop());
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, LIVE_PARTICIPANT_STOP_TIMEOUT_MS);
    const finish = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    stopPromise.then(finish, finish);
  });
}

function isRetryableParticipantFailure(error: unknown) {
  if (!(error instanceof ApiClientError)) return true;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

function isTerminalHeartbeatError(error: unknown) {
  if (!(error instanceof ApiClientError)) return false;
  return [401, 404, 409, 410].includes(error.status);
}

function formatGroupCallStatus(status: string) {
  return (
    (
      {
        idle: "Lista",
        starting: "Conectando",
        active: "En vivo",
        degraded: "En vivo · parcial",
        ending: "Finalizando",
        ended: "Finalizada",
        error: "Con error",
      } as Record<string, string>
    )[status] ?? status
  );
}

function formatTurnPhase(phase: TurnPhase) {
  if (phase === "speaking") return "Hablando";
  if (phase === "queued") return "Preparando respuesta";
  if (phase === "deliberating") return "Analizando";
  if (phase === "committing") return "Cerrando turno";
  return phase === "listening" ? "Tu turno" : "Escuchando";
}

function participantStatusLabel(status: LocalParticipant["clientStatus"]) {
  if (status === "active") return "Escuchando";
  if (status === "connecting") return "Conectando";
  if (status === "recovering") return "Recuperando conexión";
  return "Sin conexión";
}

function participantTurnLabel(input: {
  participant: LocalParticipant;
  isSpeaker: boolean;
  ownsTurn: boolean;
  isLive: boolean;
  anotherAvatarHasTurn: boolean;
}) {
  if (input.participant.clientStatus !== "active") {
    return participantStatusLabel(input.participant.clientStatus);
  }
  if (input.isSpeaker) return "Hablando";
  if (input.ownsTurn) return "Preparando respuesta";
  if (input.isLive && input.anotherAvatarHasTurn) return "Esperando turno";
  return input.isLive ? "Escuchando" : "Listo";
}

function turnStatusLabel(phase: TurnPhase, turnOwnerName: string | undefined, isMuted: boolean) {
  if (phase === "speaking") return `${turnOwnerName ?? "El avatar"} está hablando · esperá a que termine`;
  if (phase === "queued") return `${turnOwnerName ?? "El avatar"} está preparando su respuesta`;
  if (phase === "deliberating") return "Analizando el pedido y consultando a los expertos…";
  if (phase === "committing") return "Guardando la intervención…";
  return isMuted ? "Tu turno · activá el micrófono para hablar" : "Tu turno · podés hablar";
}
