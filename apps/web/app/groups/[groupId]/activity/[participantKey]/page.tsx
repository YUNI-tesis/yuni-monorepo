import { GroupParticipantActivity } from "../../../../../components/groups/GroupParticipantActivity";

export default async function GroupParticipantActivityRoute({
  params,
}: {
  params: Promise<{ groupId: string; participantKey: string }>;
}) {
  const { groupId, participantKey } = await params;
  return <GroupParticipantActivity groupId={groupId} participantKey={participantKey} />;
}
