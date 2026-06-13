import { InteractCall } from "../../../components/interact/InteractCall";

export default async function InteractAvatarPage({ params }: { params: Promise<{ avatarId: string }> }) {
  const { avatarId } = await params;

  return <InteractCall avatarId={avatarId} />;
}
