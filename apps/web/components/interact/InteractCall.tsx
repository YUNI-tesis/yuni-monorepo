"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, ErrorState, LoadingState, Toast, YuniIcon, type BadgeTone } from "@yuni/ui";
import { useLiveAvatarSession, type LiveAvatarDiagnostics } from "../../hooks/useLiveAvatarSession";
import {
  endVoiceSessionOnUnload,
  getAvatarInteractionContext,
  getConversation,
  listAvatarConversations,
  type ApiInteractionContext,
  type ApiConversationDetail,
  type ApiConversationSummary,
} from "../../lib/api/avatar-api";
import { getMe } from "../../lib/api/auth-api";
import { ApiClientError, toUserFacingApiError } from "../../lib/api/http-client";
import { formatInteractionLimitsSummary, hasConfiguredInteractionLimits } from "../../lib/avatar-sharing";
import {
  CallExperienceShell,
  CallParticipantStage,
  InteractCallControls,
  InteractConversationHistoryPanel,
  formatConversationTitle,
} from "./CallExperience";
import {
  SharedCallPrivacyDialog,
  getSharedCallConsentStorageKey,
  readRememberedPrivacyChoice,
  rememberPrivacyChoiceForAvatar,
} from "./SharedCallPrivacyDialog";
import styles from "./Interact.module.css";

export { InteractCallControls, InteractConversationHistoryPanel, formatConversationTitle };
export {
  getSharedCallConsentStorageKey,
  readRememberedPrivacyChoice,
  rememberPrivacyChoiceForAvatar,
} from "./SharedCallPrivacyDialog";

type AvatarState =
  | { status: "loading"; avatar: null; error: null }
  | { status: "ready"; avatar: ApiInteractionContext; error: null }
  | { status: "error"; avatar: null; error: string }
  | { status: "not-found"; avatar: null; error: string };

type HistoryLoadStatus = "idle" | "loading" | "ready" | "error";

type ConversationHistoryState = {
  summariesStatus: HistoryLoadStatus;
  summaries: ApiConversationSummary[];
  summariesError: string | null;
  selectedConversationId: string | null;
  detailStatus: HistoryLoadStatus;
  detail: ApiConversationDetail | null;
  detailError: string | null;
};

const initialHistoryState: ConversationHistoryState = {
  summariesStatus: "idle",
  summaries: [],
  summariesError: null,
  selectedConversationId: null,
  detailStatus: "idle",
  detail: null,
  detailError: null,
};

export function InteractCall({ avatarId }: { avatarId: string }) {
  const router = useRouter();
  const privacyDialog = useRef<HTMLDialogElement>(null);
  const mountedRef = useRef(true);
  const startRequestTokenRef = useRef(0);
  const [avatarState, setAvatarState] = useState<AvatarState>({
    status: "loading",
    avatar: null,
    error: null,
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyState, setHistoryState] = useState<ConversationHistoryState>(initialHistoryState);
  const [rememberPrivacyChoice, setRememberPrivacyChoice] = useState(false);
  const [privacyStorageKey, setPrivacyStorageKey] = useState<string | null>(null);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      setHistoryState((current) => ({
        ...current,
        selectedConversationId: conversationId,
        detailStatus: "loading",
        detailError: null,
      }));

      try {
        const { conversation } = await getConversation(conversationId);

        setHistoryState((current) =>
          current.selectedConversationId === conversationId
            ? {
                ...current,
                detailStatus: "ready",
                detail: conversation,
                detailError: null,
              }
            : current
        );
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          router.push("/auth/login");
          return;
        }

        setHistoryState((current) =>
          current.selectedConversationId === conversationId
            ? {
                ...current,
                detailStatus: "error",
                detail: null,
                detailError: toUserFacingApiError(error, "No pudimos abrir este chat."),
              }
            : current
        );
      }
    },
    [router]
  );

  const loadHistory = useCallback(
    async (options: { selectLatest?: boolean } = {}) => {
      setHistoryState((current) => ({
        ...current,
        summariesStatus: "loading",
        summariesError: null,
      }));

      try {
        const { conversations } = await listAvatarConversations(avatarId);

        setHistoryState((current) => ({
          ...current,
          summariesStatus: "ready",
          summaries: conversations,
          summariesError: null,
          selectedConversationId: conversations.some(
            (conversation) => conversation.id === current.selectedConversationId
          )
            ? current.selectedConversationId
            : null,
          detail:
            current.detail && conversations.some((conversation) => conversation.id === current.detail?.id)
              ? current.detail
              : null,
        }));

        if (options.selectLatest && conversations[0]) {
          void loadConversation(conversations[0].id);
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          router.push("/auth/login");
          return;
        }

        setHistoryState((current) => ({
          ...current,
          summariesStatus: "error",
          summariesError: toUserFacingApiError(error, "No pudimos cargar el historial."),
        }));
      }
    },
    [avatarId, loadConversation, router]
  );

  const call = useLiveAvatarSession(avatarId, {
    onEnded: () => loadHistory({ selectLatest: false }),
    endSessionOnUnload: (realtimeSessionId, transcript) => {
      endVoiceSessionOnUnload(realtimeSessionId, transcript);
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startRequestTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setAvatarState({ status: "loading", avatar: null, error: null });
    setHistoryState(initialHistoryState);
    setIsHistoryOpen(false);

    getAvatarInteractionContext(avatarId)
      .then(({ interactionContext }) => {
        if (isMounted) {
          setAvatarState({ status: "ready", avatar: interactionContext, error: null });
        }
      })
      .catch((error) => {
        if (error instanceof ApiClientError && error.status === 401) {
          router.push("/auth/login");
          return;
        }

        if (isMounted) {
          setAvatarState({
            status: error instanceof ApiClientError && error.status === 404 ? "not-found" : "error",
            avatar: null,
            error: toUserFacingApiError(error, "No pudimos cargar el avatar."),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [avatarId, router]);

  if (avatarState.status === "loading") {
    return <LoadingState title="Cargando llamada" description="Estamos preparando el avatar." />;
  }

  if (avatarState.status === "not-found") {
    return (
      <ErrorState
        title="No encontramos este avatar"
        description={avatarState.error}
        action={<Button onClick={() => router.push("/avatars")}>Volver a Mis avatares</Button>}
      />
    );
  }

  if (avatarState.status === "error") {
    return <ErrorState title="No pudimos cargar la llamada" description={avatarState.error} />;
  }

  const interactionContext = avatarState.avatar;
  const avatar = interactionContext.avatar;
  const isInCall = call.status === "starting" || call.status === "active" || call.status === "ending";
  const canStart =
    interactionContext.voiceAvailability === "ready" &&
    !call.hasPendingEnd &&
    (call.status === "idle" || call.status === "ended" || call.status === "error");
  const contextNotice =
    interactionContext.access.type === "shared" && interactionContext.voiceAvailability !== "ready"
      ? null
      : getContextStatusDescription(interactionContext.contextStatus);

  async function requestCallStart() {
    if (!canStart) return;
    const requestToken = ++startRequestTokenRef.current;
    const isCurrentRequest = () => mountedRef.current && startRequestTokenRef.current === requestToken;
    const beginCall = () => {
      if (!isCurrentRequest()) return;
      startRequestTokenRef.current += 1;
      call.start();
    };

    if (interactionContext.access.type === "owner") {
      beginCall();
      return;
    }

    try {
      const { user } = await getMe();
      if (!isCurrentRequest()) return;
      const storageKey = getSharedCallConsentStorageKey(user.id, avatar.id);

      if (readRememberedPrivacyChoice(storageKey)) {
        beginCall();
        return;
      }

      setPrivacyStorageKey(storageKey);
      setRememberPrivacyChoice(false);
      privacyDialog.current?.showModal();
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (error instanceof ApiClientError && error.status === 401) {
        router.push("/auth/login");
        return;
      }

      setPrivacyStorageKey(null);
      setRememberPrivacyChoice(false);
      privacyDialog.current?.showModal();
    }
  }

  function confirmCallStart() {
    if (rememberPrivacyChoice && privacyStorageKey) {
      rememberPrivacyChoiceForAvatar(privacyStorageKey);
    }

    privacyDialog.current?.close();
    startRequestTokenRef.current += 1;
    call.start();
  }

  function toggleHistory() {
    setIsHistoryOpen((current) => !current);

    if (!isHistoryOpen && historyState.summariesStatus === "idle") {
      void loadHistory();
    }
  }

  return (
    <CallExperienceShell
      backLabel="Mis avatares"
      onBack={() => router.push("/avatars")}
      eyebrow={interactionContext.access.type === "shared" ? "Llamada compartida" : "Llamada privada"}
      title={avatar.name}
      description={avatar.description}
      isHistoryOpen={isHistoryOpen}
      onCloseHistory={() => setIsHistoryOpen(false)}
      actions={
        <>
          <Button
            variant="ghost"
            icon={<YuniIcon name="history" />}
            aria-controls="call-history-panel"
            aria-expanded={isHistoryOpen}
            onClick={toggleHistory}
          >
            Historial
          </Button>
          {interactionContext.access.type === "owner" ? (
            <Button
              variant="ghost"
              icon={<YuniIcon name="user" />}
              onClick={() => router.push(`/avatars/${avatar.id}`)}
            >
              Perfil
            </Button>
          ) : null}
        </>
      }
      historyContent={
        <InteractConversationHistoryPanel
          avatarName={avatar.name}
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
        <>
          <InteractDebugPanel
            isVisible={shouldShowInteractDiagnostics()}
            diagnostics={call.diagnostics}
            callStatus={call.status}
            providerSyncError={null}
            onSendTextProbe={call.sendTextProbe}
          />

          {interactionContext.access.type === "shared" ? (
            <SharedCallPrivacyDialog
              ref={privacyDialog}
              sharedAvatarNames={[avatar.name]}
              rememberChoice={rememberPrivacyChoice}
              onRememberChoiceChange={setRememberPrivacyChoice}
              onConfirm={confirmCallStart}
              onCancel={() => {
                setRememberPrivacyChoice(false);
                setPrivacyStorageKey(null);
              }}
              limitsSummary={
                hasConfiguredInteractionLimits(interactionContext.access.limits)
                  ? formatInteractionLimitsSummary(interactionContext.access.limits)
                  : null
              }
            />
          ) : null}
        </>
      }
    >
      <CallParticipantStage
        label={`Llamada con ${avatar.name}`}
        participants={[
          {
            id: avatar.id,
            name: avatar.name,
            status: call.status === "active" ? "active" : call.status === "starting" ? "connecting" : "ready",
            statusLabel:
              call.status === "active"
                ? formatConversationState(call.conversationState)
                : formatCallStatus(call.status),
            isSpeaking: call.isAvatarSpeaking,
            ownsTurn: call.conversationState === "thinking" || call.conversationState === "speaking",
            attachMediaElement: call.attachMediaElement,
            placeholderTitle: call.status === "starting" ? "Conectando con el avatar" : "Listo para llamar",
            placeholderDescription: call.endedByLimit
              ? "La llamada terminó al alcanzar la duración disponible."
              : call.status === "starting"
                ? "Estamos abriendo la sesión de voz."
                : "Cuando inicies, el historial se guarda al finalizar la llamada.",
          },
        ]}
        badges={
          <>
            <Badge tone={call.status === "active" ? "success" : "neutral"}>
              {formatCallStatus(call.status)}
            </Badge>
            <Badge tone={conversationTone(call.conversationState)}>
              {formatConversationState(call.conversationState)}
            </Badge>
            <Badge tone={formatContextStatusTone(interactionContext.contextStatus)}>
              {formatContextStatusLabel(interactionContext.contextStatus)}
            </Badge>
            {call.remainingSeconds !== null ? (
              <Badge tone={call.remainingSeconds <= 60 ? "warning" : "neutral"}>
                {call.remainingSeconds <= 60 ? "Un minuto o menos · " : "Disponible · "}
                {formatInteractionCountdown(call.remainingSeconds)}
              </Badge>
            ) : null}
            <span className={styles.srOnly} role="status" aria-live="polite">
              {call.remainingSeconds !== null && call.remainingSeconds <= 60
                ? "Queda un minuto o menos de llamada."
                : ""}
            </span>
          </>
        }
        dock={
          <>
            {contextNotice ? (
              <p
                className={styles.contextNotice}
                role={interactionContext.contextStatus === "failed" ? "alert" : undefined}
              >
                {contextNotice}
              </p>
            ) : null}
            {interactionContext.access.type === "shared" &&
            !isInCall &&
            hasConfiguredInteractionLimits(interactionContext.access.limits) ? (
              <p className={styles.limitsNotice} role="status">
                <YuniIcon name="warning" size={20} />
                <span>
                  Límites de uso: {formatInteractionLimitsSummary(interactionContext.access.limits)}
                </span>
              </p>
            ) : null}
            {interactionContext.access.type === "shared" &&
            interactionContext.voiceAvailability !== "ready" ? (
              <p className={styles.contextNotice} role="status">
                Este avatar todavía no está disponible para interactuar. Avisale al creador.
              </p>
            ) : null}
            {call.error ? (
              <Toast tone="warning" role="alert" aria-live="assertive" onDismiss={call.dismissError}>
                {call.error}
              </Toast>
            ) : null}
            {call.hasPendingEnd ? (
              <Button onClick={() => void call.end()}>Reintentar guardado</Button>
            ) : (
              <InteractCallControls
                status={call.status}
                isMuted={call.isMuted}
                canStart={canStart}
                onStart={() => void requestCallStart()}
                onToggleMute={call.toggleMute}
                onInterrupt={call.interrupt}
                onEnd={call.end}
              />
            )}
          </>
        }
      />
    </CallExperienceShell>
  );
}

export function formatContextStatusLabel(status: ApiInteractionContext["contextStatus"]) {
  if (status === "ready") return "Listo";
  if (status === "failed") return "No se pudo actualizar";
  return "Procesando";
}

export function formatInteractionCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatSharedCallPrivacyDescription(limits: ApiInteractionContext["access"]["limits"]) {
  const privacy = "La llamada y su transcripción se guardarán. El creador podrá consultarlas en Actividad.";
  return hasConfiguredInteractionLimits(limits)
    ? `${privacy} Límites: ${formatInteractionLimitsSummary(limits)}.`
    : privacy;
}

export function formatContextStatusTone(status: ApiInteractionContext["contextStatus"]): BadgeTone {
  if (status === "ready") return "success";
  if (status === "failed") return "danger";
  return "warning";
}

export function shouldShowInteractDiagnostics(environment = process.env.NODE_ENV) {
  return environment === "development";
}

export function InteractDebugPanel({
  isVisible,
  diagnostics,
  callStatus,
  providerSyncError,
  onSendTextProbe,
}: {
  isVisible: boolean;
  diagnostics: LiveAvatarDiagnostics;
  callStatus: ReturnType<typeof useLiveAvatarSession>["status"];
  providerSyncError: string | null;
  onSendTextProbe: () => void;
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <details className={styles.debugPanel}>
      <summary>Diagnostico tecnico</summary>
      <div className={styles.debugGrid}>
        <span>Microfono SDK: {diagnostics.voiceChatState}</span>
        <span>Nivel mic: {formatMicrophoneLevel(diagnostics.microphoneLevel)}</span>
        <span>Eventos recibidos: {diagnostics.eventCount}</span>
        <span>Ultimo evento: {diagnostics.lastEventType ?? "Sin eventos"}</span>
        <span>ElevenLabs: {diagnostics.lastElevenLabsEventType ?? "Sin eventos"}</span>
        {providerSyncError ? <span>Sync provider: {providerSyncError}</span> : null}
        <Button
          variant="secondary"
          onClick={onSendTextProbe}
          disabled={callStatus !== "active" || diagnostics.textProbeStatus === "sending"}
        >
          {diagnostics.textProbeStatus === "sending" ? "Enviando prueba..." : "Probar agente por texto"}
        </Button>
        {diagnostics.textProbeStatus === "sent" ? <span>Prueba enviada por LiveAvatar.</span> : null}
        {diagnostics.textProbeError ? <p className={styles.syncError}>{diagnostics.textProbeError}</p> : null}
      </div>
    </details>
  );
}

function getContextStatusDescription(status: ApiInteractionContext["contextStatus"]) {
  if (status === "failed") {
    return "El contexto no se pudo actualizar. Si hay una version anterior valida, podes intentar iniciar la llamada.";
  }

  if (status === "processing") {
    return "El contexto se esta preparando. La llamada solo se inicia si el avatar ya tiene una version valida.";
  }

  return null;
}

function formatCallStatus(status: ReturnType<typeof useLiveAvatarSession>["status"]) {
  if (status === "starting") return "Conectando";
  if (status === "active") return "En llamada";
  if (status === "ending") return "Cerrando";
  if (status === "ended") return "Finalizada";
  if (status === "error") return "Error";
  return "Lista";
}

function formatConversationState(state: ReturnType<typeof useLiveAvatarSession>["conversationState"]) {
  if (state === "listening") return "Escuchando";
  if (state === "thinking") return "Pensando";
  if (state === "speaking") return "Hablando";
  if (state === "interrupted") return "Interrumpido";
  return "En espera";
}

function conversationTone(state: ReturnType<typeof useLiveAvatarSession>["conversationState"]): BadgeTone {
  if (state === "listening") return "warning";
  if (state === "thinking") return "neutral";
  if (state === "speaking") return "success";
  if (state === "interrupted") return "danger";
  return "neutral";
}

function formatMicrophoneLevel(level: number | null) {
  if (level === null) return "Sin medicion";

  return `${Math.round(level * 100)}%`;
}
