import {
  LiveAvatarConfigSchema,
  VoiceConfigSchema,
  type GroupInteractionAvailability,
  type GroupSharingEligibility,
} from "@yuni/domain";

type GroupMember = {
  accessGrantId: string | null;
  avatarAgent: {
    ownerId: string;
    status: string;
    liveAvatarConfig: unknown;
    voiceConfig: unknown;
    groupProviderAgentId: string | null;
    groupProviderSyncStatus: string;
  };
};

export function groupSharingEligibility(group: {
  ownerId: string;
  members: GroupMember[];
}): GroupSharingEligibility {
  return group.members.every(
    (member) => member.accessGrantId === null && member.avatarAgent.ownerId === group.ownerId
  )
    ? { status: "eligible" }
    : { status: "blocked", reason: "contains_non_owned_members" };
}

export function groupInteractionAvailability(group: {
  members: GroupMember[];
}): GroupInteractionAvailability {
  const totalMembers = group.members.length;
  const readyMembers = group.members.filter((member) => isGroupMemberReady(member.avatarAgent)).length;

  if (totalMembers < 2 || totalMembers > 3) {
    return { status: "unavailable", reason: "invalid_roster", readyMembers, totalMembers };
  }
  if (group.members.some((member) => member.avatarAgent.status !== "active")) {
    return { status: "unavailable", reason: "inactive_member", readyMembers, totalMembers };
  }
  if (
    group.members.some(
      (member) =>
        !LiveAvatarConfigSchema.safeParse(member.avatarAgent.liveAvatarConfig).success ||
        !VoiceConfigSchema.safeParse(member.avatarAgent.voiceConfig).success ||
        member.avatarAgent.groupProviderSyncStatus === "failed"
    )
  ) {
    return { status: "unavailable", reason: "provider_error", readyMembers, totalMembers };
  }
  if (readyMembers !== totalMembers) {
    return { status: "unavailable", reason: "preparing", readyMembers, totalMembers };
  }
  return { status: "ready", readyMembers, totalMembers };
}

function isGroupMemberReady(member: GroupMember["avatarAgent"]) {
  return (
    member.status === "active" &&
    LiveAvatarConfigSchema.safeParse(member.liveAvatarConfig).success &&
    VoiceConfigSchema.safeParse(member.voiceConfig).success &&
    member.groupProviderSyncStatus === "synced" &&
    Boolean(member.groupProviderAgentId)
  );
}
