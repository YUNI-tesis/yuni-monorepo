"use client";

import React, { type ReactNode } from "react";
import { Button, YuniIcon } from "@yuni/ui";
import styles from "./Interact.module.css";

export type CallParticipantView = {
  id: string;
  name: string;
  status: "ready" | "connecting" | "active" | "errored";
  statusLabel: string;
  mediaMuted?: boolean;
  isSpeaking?: boolean;
  ownsTurn?: boolean;
  error?: string | null;
  placeholderTitle?: string;
  placeholderDescription?: string;
  attachMediaElement: (element: HTMLVideoElement | null) => void;
  onRetry?: () => void;
};

export type CallHistoryLoadStatus = "idle" | "loading" | "ready" | "error";

export type CallHistorySummary = {
  id: string;
  title: string | null;
  status: "active" | "ended";
  lastMessageAt: string | null;
  createdAt: string;
};

export type CallHistoryMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  speakerName?: string | null;
};

export type CallHistoryDetail = {
  id: string;
  title: string | null;
  messages: CallHistoryMessage[];
};

export function CallExperienceShell({
  backLabel,
  onBack,
  eyebrow,
  title,
  description,
  actions,
  isHistoryOpen,
  onCloseHistory,
  historyContent,
  children,
  footer,
}: {
  backLabel: string;
  onBack: () => void;
  eyebrow: string;
  title: string;
  description?: string | null;
  actions?: ReactNode;
  isHistoryOpen: boolean;
  onCloseHistory: () => void;
  historyContent: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={styles.focusLayout} data-history-open={isHistoryOpen ? "true" : "false"}>
      <header className={styles.focusTopbar}>
        <Button variant="ghost" icon={<YuniIcon name="arrowLeft" />} aria-label={backLabel} onClick={onBack}>
          <span className={styles.topbarControlLabel}>{backLabel}</span>
        </Button>

        <div className={styles.focusTitle}>
          <span className="yuni-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>

        <div className={styles.topbarActions}>{actions}</div>
      </header>

      <div className={styles.focusWorkspace} data-history-open={isHistoryOpen ? "true" : "false"}>
        {children}
        {isHistoryOpen ? (
          <aside id="call-history-panel" className={styles.historySidePanel} aria-labelledby="history-title">
            <div className={styles.historyHeader}>
              <div>
                <p className="yuni-eyebrow">Chats de llamada</p>
                <h2 id="history-title">Historial</h2>
              </div>
              <Button variant="secondary" icon={<YuniIcon name="close" />} onClick={onCloseHistory}>
                Cerrar
              </Button>
            </div>
            {historyContent}
          </aside>
        ) : null}
      </div>
      {footer}
    </div>
  );
}

export function CallParticipantStage({
  label,
  participants,
  badges,
  dock,
}: {
  label: string;
  participants: CallParticipantView[];
  badges?: ReactNode;
  dock: ReactNode;
}) {
  return (
    <section className={styles.stage} aria-label={label}>
      <div className={styles.participantGrid} data-count={participants.length}>
        {participants.map((participant, index) => (
          <article
            key={participant.id}
            className={styles.participantTile}
            data-speaking={participant.isSpeaking ? "true" : "false"}
            data-turn-owner={participant.ownsTurn ? "true" : "false"}
            data-status={participant.status}
          >
            <video ref={participant.attachMediaElement} autoPlay playsInline muted={participant.mediaMuted} />
            <div className={styles.videoShade} aria-hidden="true" />
            {index === 0 && badges ? <div className={styles.videoStatus}>{badges}</div> : null}

            <div className={styles.participantIdentity}>
              <strong>{participant.name}</strong>
              <span>{participant.statusLabel}</span>
            </div>

            {participant.status !== "active" ? (
              <div className={styles.videoPlaceholder}>
                <div className={styles.avatarHalo} aria-hidden="true">
                  <span>{participant.name.slice(0, 1).toLocaleUpperCase()}</span>
                </div>
                <strong>{participant.placeholderTitle ?? "Listo para llamar"}</strong>
                {participant.error ? <span role="alert">{participant.error}</span> : null}
                {!participant.error && participant.placeholderDescription ? (
                  <span>{participant.placeholderDescription}</span>
                ) : null}
                {participant.status === "errored" && participant.onRetry ? (
                  <Button variant="secondary" onClick={participant.onRetry}>
                    Reintentar
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <div className={styles.floatingDock}>{dock}</div>
    </section>
  );
}

export function InteractCallControls({
  status,
  isMuted,
  canStart,
  isActive: activeOverride,
  canToggleMute,
  canInterrupt,
  onStart,
  onToggleMute,
  onInterrupt,
  onEnd,
}: {
  status: "idle" | "starting" | "active" | "degraded" | "ending" | "ended" | "error";
  isMuted: boolean;
  canStart: boolean;
  isActive?: boolean;
  canToggleMute?: boolean;
  canInterrupt?: boolean;
  onStart: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
  onEnd: () => void;
}) {
  const isActive = activeOverride ?? (status === "active" || status === "degraded");
  const isEnding = status === "ending";
  const showEndControl = isActive || isEnding;
  const microphoneIsMuted = isActive && isMuted;
  const muteLabel = microphoneIsMuted ? "Activar micrófono" : "Silenciar micrófono";
  const callLabel = showEndControl
    ? isEnding
      ? "Finalizando llamada"
      : "Finalizar llamada"
    : status === "starting"
      ? "Iniciando llamada"
      : "Iniciar llamada";

  return (
    <div className={styles.callControls} role="group" aria-label="Controles de llamada">
      <button
        className={`${styles.controlButton} ${microphoneIsMuted ? styles.controlButtonMuted : ""}`}
        type="button"
        aria-label={muteLabel}
        title={muteLabel}
        aria-pressed={microphoneIsMuted}
        data-state={microphoneIsMuted ? "muted" : "unmuted"}
        onClick={onToggleMute}
        disabled={canToggleMute === undefined ? !isActive : !canToggleMute}
      >
        <span className={styles.controlIcon} aria-hidden="true">
          <YuniIcon name={microphoneIsMuted ? "micOff" : "mic"} size={24} />
        </span>
      </button>
      <button
        className={styles.controlButton}
        type="button"
        aria-label="Interrumpir avatar"
        title="Interrumpir avatar"
        onClick={onInterrupt}
        disabled={canInterrupt === undefined ? !isActive : !canInterrupt}
      >
        <span className={styles.controlIcon} aria-hidden="true">
          <YuniIcon name="pause" size={24} />
        </span>
      </button>
      <button
        className={`${styles.controlButton} ${showEndControl ? styles.controlButtonDanger : styles.controlButtonPrimary}`}
        type="button"
        aria-label={callLabel}
        title={callLabel}
        onClick={showEndControl ? onEnd : onStart}
        disabled={showEndControl ? !isActive : !canStart}
      >
        <span className={styles.controlIcon} aria-hidden="true">
          <YuniIcon name={showEndControl ? "callEnd" : "call"} size={24} />
        </span>
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
  summaries: CallHistorySummary[];
  summariesStatus: CallHistoryLoadStatus;
  summariesError: string | null;
  selectedConversationId: string | null;
  detail: CallHistoryDetail | null;
  detailStatus: CallHistoryLoadStatus;
  detailError: string | null;
  onRefresh: () => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  const selectedSummary = summaries.find((conversation) => conversation.id === detail?.id);

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
          <ConversationDetail
            conversation={detail}
            avatarName={avatarName}
            timestamp={selectedSummary?.lastMessageAt ?? selectedSummary?.createdAt ?? null}
          />
        ) : null}
      </div>
    </div>
  );
}

function ConversationDetail({
  conversation,
  avatarName,
  timestamp,
}: {
  conversation: CallHistoryDetail;
  avatarName: string;
  timestamp: string | null;
}) {
  return (
    <div className={styles.conversationDetail}>
      <div className={styles.detailHeader}>
        <p className="yuni-eyebrow">Transcripcion literal</p>
        <h3>{formatConversationTitle(conversation.title, avatarName)}</h3>
        <span>{formatConversationTimestamp(timestamp)}</span>
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
              <small>{formatMessageRole(message, avatarName)}</small>
              <span>{message.content}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function formatConversationTitle(title: string | null, subjectName: string) {
  return title?.trim() || `Llamada con ${subjectName}`;
}

function formatConversationStatus(status: CallHistorySummary["status"]) {
  return status === "ended" ? "Finalizada" : "En curso";
}

function formatConversationTimestamp(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMessageRole(message: CallHistoryMessage, avatarName: string) {
  if (message.role === "user") return "Usuario";
  if (message.role === "assistant") return message.speakerName ?? avatarName;
  return "Sistema";
}
