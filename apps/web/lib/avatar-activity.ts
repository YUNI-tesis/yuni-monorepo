import type { ApiActivityConversation, ApiActivityParticipantState } from "./api/activity-api";

export function getActivityParticipantPresentation(state: ApiActivityParticipantState) {
  if (state === "linked") return { label: "Cuenta vinculada", tone: "success" as const };
  if (state === "revoked") return { label: "Acceso revocado", tone: "danger" as const };
  return { label: "Cuenta pendiente", tone: "warning" as const };
}

export function mergeActivityConversationPages(
  current: ApiActivityConversation[],
  incoming: ApiActivityConversation[]
) {
  const conversations = new Map(current.map((conversation) => [conversation.id, conversation]));
  for (const conversation of incoming) conversations.set(conversation.id, conversation);
  return Array.from(conversations.values());
}

export function formatActivityDate(value: string | null) {
  if (!value) return "Sin actividad";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatActivityConversationTitle(
  conversation: Pick<ApiActivityConversation, "title">,
  participantEmail: string
) {
  return conversation.title?.trim() || `Conversación con ${participantEmail}`;
}

export function getParticipantActivityPath(avatarId: string, accessGrantId: string) {
  return `/avatars/${encodeURIComponent(avatarId)}/activity/${encodeURIComponent(accessGrantId)}`;
}

export function getAvatarActivityTabPath(avatarId: string) {
  return `/avatars/${encodeURIComponent(avatarId)}?tab=activity`;
}
