"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader, type BadgeTone } from "@yuni/ui";
import { useLiveAvatarSession } from "../../hooks/useLiveAvatarSession";
import { invalidateAvatarListCache } from "../../hooks/useAvatarList";
import { getAvatar, syncAgentProvider, type ApiAvatar } from "../../lib/api/avatar-api";
import { ApiClientError } from "../../lib/api/http-client";
import styles from "./Interact.module.css";

type AvatarState =
  | { status: "loading"; avatar: null; error: null }
  | { status: "ready"; avatar: ApiAvatar; error: null }
  | { status: "error"; avatar: null; error: string }
  | { status: "not-found"; avatar: null; error: string };

export function InteractCall({ avatarId }: { avatarId: string }) {
  const router = useRouter();
  const [avatarState, setAvatarState] = useState<AvatarState>({
    status: "loading",
    avatar: null,
    error: null,
  });
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const call = useLiveAvatarSession(avatarId);

  useEffect(() => {
    let isMounted = true;

    getAvatar(avatarId)
      .then(({ avatar }) => {
        if (isMounted) {
          setAvatarState({ status: "ready", avatar, error: null });
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

  async function onSync() {
    setSyncStatus("syncing");
    setSyncError(null);

    try {
      await syncAgentProvider(avatarId);
      const { avatar } = await getAvatar(avatarId);
      invalidateAvatarListCache();
      setAvatarState({ status: "ready", avatar, error: null });
      setSyncStatus("idle");
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error instanceof Error ? error.message : "No pudimos sincronizar el agente.");
    }
  }

  if (avatarState.status === "loading") {
    return <LoadingState title="Cargando llamada" description="Estamos preparando el avatar." />;
  }

  if (avatarState.status === "not-found") {
    return (
      <ErrorState
        title="No encontramos este avatar"
        description={avatarState.error}
        action={<Button onClick={() => router.push("/interact")}>Volver a Interact</Button>}
      />
    );
  }

  if (avatarState.status === "error") {
    return <ErrorState title="No pudimos cargar la llamada" description={avatarState.error} />;
  }

  const avatar = avatarState.avatar;
  const canStart = call.status === "idle" || call.status === "ended" || call.status === "error";
  const isInCall = call.status === "active" || call.status === "starting" || call.status === "ending";

  return (
    <div className={styles.layout}>
      <PageHeader
        eyebrow="Interact"
        title={avatar.name}
        description={avatar.description || "Llamada privada de prueba."}
        actions={
          <div className={styles.controls}>
            <Button variant="secondary" onClick={() => router.push(`/avatars/${avatar.id}`)}>
              Perfil
            </Button>
            <Button variant="secondary" onClick={() => router.push("/interact")}>
              Avatares
            </Button>
          </div>
        }
      />

      <div className={styles.callGrid}>
        <section className={styles.stage}>
          <div className={styles.statusRow}>
            <Badge tone={syncTone(avatar.providerSyncStatus)}>{formatSyncStatus(avatar.providerSyncStatus)}</Badge>
            <Badge tone={call.status === "active" ? "success" : "neutral"}>{formatCallStatus(call.status)}</Badge>
            <Badge tone={conversationTone(call.conversationState)}>
              {formatConversationState(call.conversationState)}
            </Badge>
            {call.isUserSpeaking ? <Badge tone="warning">Usuario hablando</Badge> : null}
            {call.isAvatarSpeaking ? <Badge tone="success">Avatar hablando</Badge> : null}
          </div>

          <div className={styles.videoFrame}>
            <video ref={call.attachMediaElement} autoPlay playsInline />
            {call.status !== "active" ? (
              <div className={styles.videoPlaceholder}>
                <span>{call.status === "starting" ? "Conectando con LiveAvatar..." : "La llamada esta detenida."}</span>
              </div>
            ) : null}
          </div>

          <div className={styles.controls}>
            <Button onClick={call.start} disabled={!canStart}>
              {call.status === "starting" ? "Iniciando..." : "Iniciar llamada"}
            </Button>
            <Button variant="secondary" onClick={call.toggleMute} disabled={call.status !== "active"}>
              {call.isMuted ? "Activar microfono" : "Silenciar"}
            </Button>
            <Button variant="danger" onClick={call.end} disabled={!isInCall}>
              Finalizar
            </Button>
            <Button variant="secondary" onClick={onSync} disabled={syncStatus === "syncing" || isInCall}>
              {syncStatus === "syncing" ? "Sincronizando..." : "Sincronizar agente"}
            </Button>
          </div>

          {call.error ? <ErrorState title="Error de llamada" description={call.error} /> : null}
          {syncError ? <p className={styles.syncError}>{syncError}</p> : null}
          {avatar.providerSyncError ? <p className={styles.syncError}>{avatar.providerSyncError}</p> : null}
        </section>

        <aside className={styles.sidePanel}>
          <Card padding="md" className="yuni-stack">
            <p className="yuni-eyebrow">Agente</p>
            <strong>{avatar.providerAgentId ?? "Pendiente de sincronizacion"}</strong>
            <span className="yuni-text-muted">
              El contexto textual del avatar se sincroniza con ElevenLabs antes de llamar.
            </span>
          </Card>

          <Card padding="md" className="yuni-stack">
            <p className="yuni-eyebrow">Transcript</p>
            <div className={styles.transcript}>
              {call.transcript.length === 0 ? (
                <span className="yuni-text-muted">Sin mensajes todavía.</span>
              ) : (
                call.transcript.map((message) => (
                  <div key={message.id} className={styles.message}>
                    <small>{message.role === "user" ? "Usuario" : "Avatar"}</small>
                    <span>{message.content}</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card padding="md" className="yuni-stack">
            <p className="yuni-eyebrow">Diagnostico</p>
            <span className="yuni-text-muted">Microfono SDK: {call.diagnostics.voiceChatState}</span>
            <span className="yuni-text-muted">
              Nivel mic: {formatMicrophoneLevel(call.diagnostics.microphoneLevel)}
            </span>
            <span className="yuni-text-muted">Eventos recibidos: {call.diagnostics.eventCount}</span>
            <span className="yuni-text-muted">
              Ultimo evento: {call.diagnostics.lastEventType ?? "Sin eventos"}
            </span>
            <span className="yuni-text-muted">
              ElevenLabs: {call.diagnostics.lastElevenLabsEventType ?? "Sin eventos"}
            </span>
            <Button
              variant="secondary"
              onClick={call.sendTextProbe}
              disabled={call.status !== "active" || call.diagnostics.textProbeStatus === "sending"}
            >
              {call.diagnostics.textProbeStatus === "sending" ? "Enviando prueba..." : "Probar agente por texto"}
            </Button>
            {call.diagnostics.textProbeStatus === "sent" ? (
              <span className="yuni-text-muted">Prueba enviada por LiveAvatar.</span>
            ) : null}
            {call.diagnostics.textProbeError ? (
              <p className={styles.syncError}>{call.diagnostics.textProbeError}</p>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function formatSyncStatus(status: ApiAvatar["providerSyncStatus"]) {
  if (status === "synced") return "Agente sincronizado";
  if (status === "failed") return "Sync con error";
  return "Sync pendiente";
}

function syncTone(status: ApiAvatar["providerSyncStatus"]) {
  if (status === "synced") return "success";
  if (status === "failed") return "danger";
  return "warning";
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
