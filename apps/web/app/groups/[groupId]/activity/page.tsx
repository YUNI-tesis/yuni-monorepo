import { GroupActivityPage } from "../../../../components/groups/GroupActivityPage";

export default async function GroupActivityRoute({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupActivityPage groupId={groupId} />;
}
