import { AvatarParticipantActivity } from "../../../../../components/avatar-profile/AvatarParticipantActivity";

type ParticipantActivityPageProps = {
  params: Promise<{
    avatarId: string;
    accessGrantId: string;
  }>;
};

export default async function ParticipantActivityPage({ params }: ParticipantActivityPageProps) {
  const { avatarId, accessGrantId: participantKey } = await params;
  return <AvatarParticipantActivity avatarId={avatarId} participantKey={participantKey} />;
}
