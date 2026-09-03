import type { ApiGroupActivityConversation } from "./api/group-activity-api";

export function getGroupActivityPath(groupId: string) {
  return `/groups/${encodeURIComponent(groupId)}/activity`;
}

export function getGroupParticipantActivityPath(groupId: string, participantKey: string) {
  return `${getGroupActivityPath(groupId)}/${encodeURIComponent(participantKey)}`;
}

export function mergeGroupActivityConversationPages(
  current: ApiGroupActivityConversation[],
  incoming: ApiGroupActivityConversation[]
) {
  const conversations = new Map(current.map((conversation) => [conversation.id, conversation]));
  for (const conversation of incoming) conversations.set(conversation.id, conversation);
  return Array.from(conversations.values());
}

export function formatGroupRoster(roster: ApiGroupActivityConversation["roster"]) {
  return [...roster]
    .sort((left, right) => left.position - right.position)
    .map((member) => member.name)
    .join(", ");
}
