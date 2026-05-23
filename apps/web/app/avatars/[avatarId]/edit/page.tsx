import { AvatarEdit } from "../../../../components/avatar-edit/AvatarEdit";

type AvatarEditPageProps = {
  params: Promise<{
    avatarId: string;
  }>;
};

export default async function AvatarEditPage({ params }: AvatarEditPageProps) {
  const { avatarId } = await params;

  return <AvatarEdit avatarId={avatarId} />;
}
