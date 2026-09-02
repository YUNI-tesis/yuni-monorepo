import type { ApiGroupOrchestrationPhase } from "../../lib/api/avatar-group-api";

export type GroupCallStatus = "idle" | "starting" | "active" | "degraded" | "ending" | "ended" | "error";

export type GroupParticipantClientStatus = "connecting" | "active" | "recovering" | "errored";

export function isGroupCallWarning(message: string) {
  return /no respondió|transcripción|tiempo|límite|limit|continúa|interrumpió/i.test(message);
}

export function groupCallErrorMessage(status: GroupCallStatus, warning: boolean, message: string) {
  const normalized = message.trim();
  if (/^.{1,80} no respondió a tiempo\. Ya podés volver a hablar\.$/i.test(normalized)) {
    return normalized;
  }
  if (
    /límite|limit|llamadas permitidas|capacidad de llamadas|demasiados intentos|llamada activa/i.test(
      normalized
    )
  ) {
    return "Se alcanzó un límite de uso para esta llamada. Intentá nuevamente más tarde.";
  }
  if (/transcrip/i.test(normalized)) {
    return "La transcripción en vivo se interrumpió. Intentá reactivar el micrófono para continuar.";
  }
  if (warning) {
    return "La llamada continúa, pero una operación tardó más de lo esperado.";
  }
  if (status === "starting") {
    return "No pudimos conectar la llamada grupal. Revisá tu conexión e intentá nuevamente.";
  }
  if (status === "ending" || status === "ended" || status === "error") {
    return "No pudimos completar o guardar la llamada. Intentá nuevamente.";
  }
  return "La llamada tuvo un problema de conexión. Intentá nuevamente.";
}

export function groupCallErrorTitle(status: GroupCallStatus, warning: boolean) {
  if (warning) return "Advertencia durante la llamada";
  if (status === "starting") return "No pudimos iniciar la llamada";
  if (status === "ending" || status === "error") return "No pudimos completar la llamada";
  return "Hubo un problema con la llamada";
}

export function formatGroupCallStatus(status: GroupCallStatus) {
  return {
    idle: "Lista",
    starting: "Conectando",
    active: "En vivo",
    degraded: "En vivo · parcial",
    ending: "Finalizando",
    ended: "Finalizada",
    error: "Con error",
  }[status];
}

export function formatRemainingTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTurnPhase(phase: ApiGroupOrchestrationPhase) {
  if (phase === "speaking") return "Hablando";
  if (phase === "queued") return "Preparando respuesta";
  if (phase === "deliberating") return "Analizando";
  if (phase === "committing") return "Cerrando turno";
  return phase === "listening" ? "Tu turno" : "Escuchando";
}

export function participantTurnLabel(input: {
  participant: { clientStatus: GroupParticipantClientStatus };
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

export function turnStatusLabel(
  phase: ApiGroupOrchestrationPhase,
  turnOwnerName: string | undefined,
  isMuted: boolean
) {
  if (phase === "speaking") return `${turnOwnerName ?? "El avatar"} está hablando · esperá a que termine`;
  if (phase === "queued") return `${turnOwnerName ?? "El avatar"} está preparando su respuesta`;
  if (phase === "deliberating") return "Analizando el pedido y consultando a los expertos…";
  if (phase === "committing") return "Guardando la intervención…";
  return isMuted ? "Tu turno · activá el micrófono para hablar" : "Tu turno · podés hablar";
}

function participantStatusLabel(status: GroupParticipantClientStatus) {
  if (status === "active") return "Escuchando";
  if (status === "connecting") return "Conectando";
  if (status === "recovering") return "Recuperando conexión";
  return "Sin conexión";
}
