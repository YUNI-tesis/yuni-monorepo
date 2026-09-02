import { Prisma } from "@prisma/client";

const activeStatuses = ["connecting", "active"] as const;
const participantLockNamespace = "external-participant:";

type Transaction = Prisma.TransactionClient;

export function normalizeExternalParticipantEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function lockExternalParticipant(tx: Transaction, participantEmail: string) {
  const normalizedEmail = normalizeExternalParticipantEmail(participantEmail);
  await tx.$queryRaw(
    // PostgreSQL returns void for the blocking lock function. Cast it before
    // Prisma decodes the row while preserving the transaction-scoped lock.
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${participantLockNamespace}${normalizedEmail}`}))::text AS "lock"`
  );
  return normalizedEmail;
}

export async function countActiveExternalSessionsForParticipant(tx: Transaction, participantEmail: string) {
  const normalizedEmail = normalizeExternalParticipantEmail(participantEmail);
  const [individualActive, groupActive] = await Promise.all([
    tx.realtimeSession.count({
      where: {
        status: { in: [...activeStatuses] },
        groupVoiceParticipant: { is: null },
        OR: [
          { publicSession: { is: { participantEmail: normalizedEmail } } },
          { accessGrant: { is: { participantEmail: normalizedEmail } } },
        ],
      },
    }),
    tx.groupVoiceSession.count({
      where: {
        status: { in: [...activeStatuses] },
        OR: [
          { groupPublicSession: { is: { participantEmail: normalizedEmail } } },
          { groupAccessGrant: { is: { participantEmail: normalizedEmail } } },
        ],
      },
    }),
  ]);

  return individualActive + groupActive;
}

export async function countActiveExternalSessionsForAvatar(tx: Transaction, avatarAgentId: string) {
  const [individualActive, groupActive] = await Promise.all([
    tx.realtimeSession.count({
      where: {
        avatarAgentId,
        status: { in: [...activeStatuses] },
        groupVoiceParticipant: { is: null },
        OR: [{ publicSessionId: { not: null } }, { accessGrantId: { not: null } }],
      },
    }),
    tx.groupVoiceParticipant.count({
      where: {
        avatarAgentId,
        status: { in: [...activeStatuses] },
        groupVoiceSession: {
          status: { in: [...activeStatuses] },
          OR: [{ groupAccessGrantId: { not: null } }, { groupPublicSessionId: { not: null } }],
        },
      },
    }),
  ]);

  return individualActive + groupActive;
}
