export const DASHBOARD_SEED_PREFIX = "dashboard-seed";
export const DASHBOARD_SEED_OWNER_ID = `${DASHBOARD_SEED_PREFIX}-creator`;
export const DASHBOARD_SEED_OWNER_EMAIL = `${DASHBOARD_SEED_PREFIX}@yuni.local`;

export function dashboardSeedParticipantId(email: string) {
  return `${DASHBOARD_SEED_PREFIX}-participant-${email.slice(0, email.indexOf("@"))}`;
}

export function dashboardSeedAccessGrantId(avatarId: string, email: string) {
  const avatarKey = avatarId.replace(`${DASHBOARD_SEED_PREFIX}-avatar-`, "");
  const participantKey = email.slice(0, email.indexOf("@"));
  return `${DASHBOARD_SEED_PREFIX}-grant-${avatarKey}-${participantKey}`;
}
