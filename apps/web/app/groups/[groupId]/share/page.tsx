import { GroupSharePage } from "../../../../components/groups/GroupSharePage";

export default async function ShareGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupSharePage groupId={groupId} />;
}
