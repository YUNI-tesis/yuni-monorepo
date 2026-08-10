"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Dialog, ErrorState, LoadingState, type BadgeTone } from "@yuni/ui";
import { useLiveAvatarSession, type LiveAvatarDiagnostics } from "../../hooks/useLiveAvatarSession";
import {
  getAvatarInteractionContext,
  getConversation,
  listAvatarConversations,
  type ApiInteractionContext,
  type ApiConversationDetail,
  type ApiConversationMessage,
  type ApiConversationSummary,
} from "../../lib/api/avatar-api";
import { getMe } from "../../lib/api/auth-api";
import { ApiClientError } from "../../lib/api/http-client";
import styles from "./Interact.module.css";

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
          summariesError: error instanceof Error ? error.message : "No pudimos cargar el historial.",
        }));
      }
    },
    [avatarId, loadConversation, router]
  );

  const call = useLiveAvatarSession(avatarId, {
    onEnded: () => loadHistory({ selectLatest: false }),
  });

  useEffect(() => {
    let isMounted = true;

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
            error: error instanceof Error ? error.message : "No pudimos cargar el avatar.",
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
  const canStart =
    interactionContext.voiceAvailability === "ready" &&
    (call.status === "idle" || call.status === "ended" || call.status === "error");
  const isInCall = call.status === "active" || call.status === "starting" || call.status === "ending";
  const contextNotice =
    interactionContext.access.type === "shared" && interactionContext.voiceAvailability !== "ready"
      ? null
      : getContextStatusDescription(interactionContext.contextStatus);

  async function requestCallStart() {
    if (!canStart) return;

    if (interactionContext.access.type === "owner") {
      call.start();
      return;
    }

    try {
      const { user } = await getMe();
      const storageKey = getSharedCallConsentStorageKey(user.id, avatar.id);

      if (readRememberedPrivacyChoice(storageKey)) {
        call.start();
        return;
      }

      setPrivacyStorageKey(storageKey);
      setRememberPrivacyChoice(false);
      privacyDialog.current?.showModal();
    } catch (error) {
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
    call.start();
  }

  function toggleHistory() {
    setIsHistoryOpen((current) => !current);

    if (!isHistoryOpen && historyState.summariesStatus === "idle") {
      void loadHistory();
    }
  }

  return (
    <div className={styles.focusLayout}>
      <header className={styles.focusTopbar}>
        <Button variant="ghost" icon={<IconBack />} onClick={() => router.push("/avatars")}>
          Mis avatares
        </Button>

        <div className={styles.focusTitle}>
          <span className="yuni-eyebrow">
            {interactionContext.access.type === "shared" ? "Llamada compartida" : "Llamada privada"}
          </span>
          <h1>{avatar.name}</h1>
          {avatar.description ? <p>{avatar.description}</p> : null}
        </div>

        <div className={styles.topbarActions}>
          <Button
            variant="ghost"
            icon={<IconHistory />}
            aria-controls="call-history-panel"
            aria-expanded={isHistoryOpen}
            onClick={toggleHistory}
          >
            Historial
          </Button>
          {interactionContext.access.type === "owner" ? (
            <Button
              variant="ghost"
              icon={<IconProfile />}
              onClick={() => router.push(`/avatars/${avatar.id}`)}
            >
              Perfil
            </Button>
          ) : null}
        </div>
      </header>

      <div className={styles.focusWorkspace} data-history-open={isHistoryOpen ? "true" : "false"}>
        <section className={styles.stage} aria-label={`Llamada con ${avatar.name}`}>
          <div className={styles.videoFrame}>
            <video ref={call.attachMediaElement} autoPlay playsInline />
            <div className={styles.videoShade} aria-hidden="true" />
            <div className={styles.videoStatus} aria-live="polite">
              <Badge tone={call.status === "active" ? "success" : "neutral"}>
                {formatCallStatus(call.status)}
              </Badge>
              <Badge tone={conversationTone(call.conversationState)}>
                {formatConversationState(call.conversationState)}
              </Badge>
              <Badge tone={formatContextStatusTone(interactionContext.contextStatus)}>
                {formatContextStatusLabel(interactionContext.contextStatus)}
              </Badge>
            </div>

            {call.status !== "active" ? (
              <div className={styles.videoPlaceholder}>
                <div className={styles.avatarHalo} aria-hidden="true">
                  <span>{avatar.name.slice(0, 1).toUpperCase()}</span>
                </div>
                <strong>
                  {call.status === "starting" ? "Conectando con el avatar" : "Listo para llamar"}
                </strong>
                <span>
                  {call.status === "starting"
                    ? "Estamos abriendo la sesion de voz."
                    : "Cuando inicies, el historial se guarda al finalizar la llamada."}
                </span>
              </div>
            ) : null}

            <div className={styles.floatingDock}>
              {contextNotice ? (
                <p
                  className={styles.contextNotice}
                  role={interactionContext.contextStatus === "failed" ? "alert" : undefined}
                >
                  {contextNotice}
                </p>
              ) : null}
              {interactionContext.access.type === "shared" &&
              interactionContext.voiceAvailability !== "ready" ? (
                <p className={styles.contextNotice} role="status">
                  Este avatar todavía no está disponible para interactuar. Avisale al creador.
                </p>
              ) : null}
              {call.error ? (
                <div className={styles.inlineError} role="alert">
                  <span>{call.error}</span>
                  <Button variant="secondary" onClick={() => void requestCallStart()} disabled={!canStart}>
                    Reintentar
                  </Button>
                </div>
              ) : null}
              <InteractCallControls
                status={call.status}
                isMuted={call.isMuted}
                canStart={canStart}
                isInCall={isInCall}
                onStart={() => void requestCallStart()}
                onToggleMute={call.toggleMute}
                onEnd={call.end}
              />
            </div>
          </div>
        </section>

        {isHistoryOpen ? (
          <aside id="call-history-panel" className={styles.historySidePanel} aria-labelledby="history-title">
            <div className={styles.historyHeader}>
              <div>
                <p className="yuni-eyebrow">Chats de llamada</p>
                <h2 id="history-title">Historial</h2>
              </div>
              <Button variant="secondary" icon={<IconClose />} onClick={() => setIsHistoryOpen(false)}>
                Cerrar
              </Button>
            </div>
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
          </aside>
        ) : null}
      </div>

      <InteractDebugPanel
        isVisible={shouldShowInteractDiagnostics()}
        diagnostics={call.diagnostics}
        callStatus={call.status}
        providerSyncError={null}
        onSendTextProbe={call.sendTextProbe}
      />

      {interactionContext.access.type === "shared" ? (
        <Dialog
          ref={privacyDialog}
          title="Antes de iniciar la llamada"
          description="La llamada y su transcripción se guardarán. El creador del avatar podrá consultar esta actividad cuando la sección Actividad esté disponible."
          closeLabel="Cancelar"
          footer={<Button onClick={confirmCallStart}>Iniciar llamada</Button>}
          onClose={() => {
            setRememberPrivacyChoice(false);
            setPrivacyStorageKey(null);
          }}
        >
          <label className={styles.privacyChoice}>
            <input
              type="checkbox"
              checked={rememberPrivacyChoice}
              onChange={(event) => setRememberPrivacyChoice(event.target.checked)}
            />
            <span>No volver a mostrar para este avatar</span>
          </label>
        </Dialog>
      ) : null}
    </div>
  );
}

export function InteractCallControls({
  status,
  isMuted,
  canStart,
  isInCall,
  onStart,
  onToggleMute,
  onEnd,
}: {
  status: ReturnType<typeof useLiveAvatarSession>["status"];
  isMuted: boolean;
  canStart: boolean;
  isInCall: boolean;
  onStart: () => void;
  onToggleMute: () => void;
  onEnd: () => void;
}) {
  const startLabel = status === "starting" ? "Iniciando" : "Iniciar";
  const muteLabel = isMuted ? "Activar mic" : "Silenciar";

  return (
    <div className={styles.callControls} aria-label="Controles de llamada">
      <button
        className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
        type="button"
        aria-label={startLabel}
        title={startLabel}
        onClick={onStart}
        disabled={!canStart}
      >
        <span className={styles.controlIcon} aria-hidden="true">
          <IconPhoneCall />
        </span>
        <span className={styles.controlLabel}>{startLabel}</span>
      </button>
      <button
        className={styles.controlButton}
        type="button"
        aria-label={muteLabel}
        title={muteLabel}
        onClick={onToggleMute}
        disabled={status !== "active"}
      >
        <span className={styles.controlIcon} aria-hidden="true">
          {isMuted ? <IconMic /> : <IconMicOff />}
        </span>
        <span className={styles.controlLabel}>{muteLabel}</span>
      </button>
      <button
        className={`${styles.controlButton} ${styles.controlButtonDanger}`}
        type="button"
        aria-label="Finalizar llamada"
        title="Finalizar llamada"
        onClick={onEnd}
        disabled={!isInCall}
      >
        <span className={styles.controlIcon} aria-hidden="true">
          <IconPhoneOff />
        </span>
        <span className={styles.controlLabel}>Finalizar</span>
      </button>
    </div>
  );
}

export function InteractConversationHistoryPanel({
  avatarName,
  summaries,
  summariesStatus,
  summariesError,
  selectedConversationId,
  detail,
  detailStatus,
  detailError,
  onRefresh,
  onSelectConversation,
}: {
  avatarName: string;
  summaries: ApiConversationSummary[];
  summariesStatus: HistoryLoadStatus;
  summariesError: string | null;
  selectedConversationId: string | null;
  detail: ApiConversationDetail | null;
  detailStatus: HistoryLoadStatus;
  detailError: string | null;
  onRefresh: () => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  return (
    <div className={styles.historyPanel}>
      <div className={styles.historyListPane}>
        <div className={styles.panelHeader}>
          <div>
            <p className="yuni-eyebrow">Conversaciones</p>
            <h3>Chats guardados</h3>
          </div>
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            Actualizar
          </Button>
        </div>

        {summariesStatus === "loading" ? <p className={styles.panelState}>Cargando historial...</p> : null}
        {summariesStatus === "error" ? (
          <div className={styles.panelError} role="alert">
            <span>{summariesError ?? "No pudimos cargar el historial."}</span>
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {summariesStatus === "ready" && summaries.length === 0 ? (
          <p className={styles.panelState}>Todavia no hay chats. Finaliza una llamada para guardarla aca.</p>
        ) : null}
        {summaries.length > 0 ? (
          <div className={styles.historyList} role="list">
            {summaries.map((conversation) => {
              const isSelected = conversation.id === selectedConversationId;

              return (
                <button
                  key={conversation.id}
                  className={`${styles.historyItem} ${isSelected ? styles.historyItemActive : ""}`}
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <strong>{formatConversationTitle(conversation.title, avatarName)}</strong>
                  <span>
                    {formatConversationTimestamp(conversation.lastMessageAt ?? conversation.createdAt)} ·{" "}
                    {formatConversationStatus(conversation.status)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className={styles.historyDetailPane}>
        {detailStatus === "idle" ? (
          <div className={styles.detailEmpty}>
            <p className="yuni-eyebrow">Transcripcion literal</p>
            <h3>Elegí un chat</h3>
            <span>Al abrirlo vas a ver los mensajes exactos de esa llamada.</span>
          </div>
        ) : null}
        {detailStatus === "loading" ? <p className={styles.panelState}>Abriendo chat...</p> : null}
        {detailStatus === "error" ? (
          <div className={styles.panelError} role="alert">
            <span>{detailError ?? "No pudimos abrir este chat."}</span>
          </div>
        ) : null}
        {detailStatus === "ready" && detail ? (
          <ConversationDetail conversation={detail} avatarName={avatarName} />
        ) : null}
      </div>
    </div>
  );
}

function ConversationDetail({
  conversation,
  avatarName,
}: {
  conversation: ApiConversationDetail;
  avatarName: string;
}) {
  return (
    <div className={styles.conversationDetail}>
      <div className={styles.detailHeader}>
        <p className="yuni-eyebrow">Transcripcion literal</p>
        <h3>{formatConversationTitle(conversation.title, avatarName)}</h3>
        <span>{formatConversationTimestamp(conversation.lastMessageAt ?? conversation.createdAt)}</span>
      </div>
      <div className={styles.conversationMessages}>
        {conversation.messages.length === 0 ? (
          <p className={styles.panelState}>Este chat no tiene mensajes guardados.</p>
        ) : (
          conversation.messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.message} ${message.role === "user" ? styles.messageUser : styles.messageAvatar}`}
            >
              <small>{formatMessageRole(message)}</small>
              <span>{message.content}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function formatContextStatusLabel(status: ApiInteractionContext["contextStatus"]) {
  if (status === "ready") return "Listo";
  if (status === "failed") return "No se pudo actualizar";
  return "Procesando";
}

export function formatContextStatusTone(status: ApiInteractionContext["contextStatus"]): BadgeTone {
  if (status === "ready") return "success";
  if (status === "failed") return "danger";
  return "warning";
}

export function shouldShowInteractDiagnostics(environment = process.env.NODE_ENV) {
  return environment === "development";
}

export function formatConversationTitle(title: string | null, avatarName: string) {
  return title?.trim() || `Llamada con ${avatarName}`;
}

type IconProps = {
  size?: number;
};

function IconFrame({ children, size = 18 }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function IconBack(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </IconFrame>
  );
}

function IconHistory(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </IconFrame>
  );
}

function IconProfile(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </IconFrame>
  );
}

function IconClose(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconFrame>
  );
}

function IconPhoneCall(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z" />
    </IconFrame>
  );
}

function IconPhoneOff(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m2 2 20 20" />
      <path d="M16.7 14.5c.2-.1.4-.2.7-.3.9.3 1.9.6 2.9.7A2 2 0 0 1 22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.8.3 1.6.5 2.3" />
      <path d="M8.1 9.9a16 16 0 0 0 6 6" />
    </IconFrame>
  );
}

function IconMic(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </IconFrame>
  );
}

function IconMicOff(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m2 2 20 20" />
      <path d="M9 9v3a3 3 0 0 0 5.1 2.1" />
      <path d="M15 9.3V5a3 3 0 0 0-5.1-2.1" />
      <path d="M19 10v2a7 7 0 0 1-.8 3.2" />
      <path d="M5 10v2a7 7 0 0 0 10.4 6.1" />
      <path d="M12 19v3" />
    </IconFrame>
  );
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

export function getSharedCallConsentStorageKey(userId: string, avatarId: string) {
  return `yuni:shared-call-consent:v1:${userId}:${avatarId}`;
}

export function readRememberedPrivacyChoice(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

export function rememberPrivacyChoiceForAvatar(storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, "true");
  } catch {
    // The preference is optional; storage failures must never block a call.
  }
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

function formatConversationStatus(status: ApiConversationSummary["status"]) {
  return status === "ended" ? "Finalizada" : "En curso";
}

function formatConversationTimestamp(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMessageRole(message: ApiConversationMessage) {
  if (message.role === "user") return "Usuario";
  if (message.role === "assistant") return "Avatar";
  return "Sistema";
}

function formatMicrophoneLevel(level: number | null) {
  if (level === null) return "Sin medicion";

  return `${Math.round(level * 100)}%`;
}
