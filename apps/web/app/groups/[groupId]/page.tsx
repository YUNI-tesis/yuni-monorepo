import { GroupInteractCall } from "../../../components/interact/GroupInteractCall";

export default async function GroupCallPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupInteractCall groupId={groupId} />;
}
