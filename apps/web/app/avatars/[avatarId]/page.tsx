import { AvatarProfile } from "../../../components/avatar-profile/AvatarProfile";

type AvatarProfileHandoffPageProps = {
  params: Promise<{
    avatarId: string;
  }>;
};

export default async function AvatarProfilePage({ params }: AvatarProfileHandoffPageProps) {
  const { avatarId } = await params;

  return <AvatarProfile avatarId={avatarId} />;
}
