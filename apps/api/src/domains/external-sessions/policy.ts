import type { InteractionLimits } from "@yuni/domain";
import type { createExternalSessionPolicyRepository } from "@yuni/db";

const WINDOW_MS = 24 * 60 * 60 * 1000;

type PolicyRepository = ReturnType<typeof createExternalSessionPolicyRepository>;
type UsageRecord = { id: string; startedAt: Date; endedAt: Date | null };

export class ShareSessionCountLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Share session count limit reached");
  }
}

export class ExternalSessionCapacityError extends Error {
  constructor(readonly retryAfterSeconds = 60) {
    super("External session capacity reached");
  }
}

export class ActiveSessionExistsError extends Error {
  constructor() {
    super("An active session already exists");
  }
}

type PolicyLockInput = {
  kind: "public" | "shared";
  targetId: string;
  avatarId: string;
  participantEmail?: string;
};

export type ExternalSessionPolicyOptions = {
  repository: PolicyRepository;
  hardMaxMinutes: number;
  maxConcurrentPerParticipant: number;
  maxConcurrentPerAvatar: number;
  now?: () => Date;
};

class KeyedMutex {
  private readonly entries = new Map<string, { tail: Promise<void>; users: number }>();

  async run<T>(keys: string[], operation: () => Promise<T>): Promise<T> {
    const releases: Array<() => void> = [];
    for (const key of [...new Set(keys)].sort()) {
      const entry = this.entries.get(key) ?? { tail: Promise.resolve(), users: 0 };
      this.entries.set(key, entry);
      entry.users += 1;
      const previous = entry.tail;
      let releaseLock: () => void = () => undefined;
      entry.tail = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      await previous;
      releases.push(() => {
        releaseLock();
        entry.users -= 1;
        if (entry.users === 0) this.entries.delete(key);
      });
    }

    try {
      return await operation();
    } finally {
      for (const release of releases.reverse()) release();
    }
  }
}

export type ExternalSessionPolicyService = ReturnType<typeof createExternalSessionPolicyService>;

export function createExternalSessionPolicyService(options: ExternalSessionPolicyOptions) {
  const mutex = new KeyedMutex();

  return {
    reservePublic(input: {
      targetId: string;
      avatarId: string;
      participantEmail: string;
      participantUserId?: string;
      consentedAt: Date;
    }) {
      const normalizedEmail = input.participantEmail.trim().toLowerCase();
      const lockInput = {
        kind: "public" as const,
        targetId: input.targetId,
        avatarId: input.avatarId,
        participantEmail: normalizedEmail,
      };
      return mutex.run(policyLockKeys(lockInput), async () => {
        const now = options.now?.() ?? new Date();
        const since = new Date(now.getTime() - WINDOW_MS);

        return options.repository.reservePublicSession(
          {
            shareLinkId: input.targetId,
            participantEmail: normalizedEmail,
            ...(input.participantUserId ? { participantUserId: input.participantUserId } : {}),
            avatarAgentId: input.avatarId,
            consentedAt: input.consentedAt,
            since,
          },
          ({ limits, usage, participantActive, avatarActive }) => {
            assertCapacity(options, participantActive, avatarActive);
            const effectiveSeconds = evaluateUsage(limits, usage, now, options.hardMaxMinutes);
            return new Date(now.getTime() + effectiveSeconds * 1000);
          }
        );
      });
    },

    reserveShared(input: { targetId: string; avatarId: string; participantUserId: string }) {
      const lockInput = { kind: "shared" as const, targetId: input.targetId, avatarId: input.avatarId };
      return mutex.run(policyLockKeys(lockInput), async () => {
        const now = options.now?.() ?? new Date();
        const since = new Date(now.getTime() - WINDOW_MS);

        return options.repository.reserveSharedSession(
          {
            accessGrantId: input.targetId,
            participantUserId: input.participantUserId,
            avatarAgentId: input.avatarId,
            since,
          },
          ({ limits, usage, participantActive, avatarActive }) => {
            assertCapacity(options, participantActive, avatarActive);
            const effectiveSeconds = evaluateUsage(limits, usage, now, options.hardMaxMinutes);
            return new Date(now.getTime() + effectiveSeconds * 1000);
          }
        );
      });
    },
  };
}

function assertCapacity(
  options: Pick<ExternalSessionPolicyOptions, "maxConcurrentPerParticipant" | "maxConcurrentPerAvatar">,
  participantActive: number,
  avatarActive: number
) {
  if (participantActive >= options.maxConcurrentPerParticipant) {
    throw new ActiveSessionExistsError();
  }
  if (avatarActive >= options.maxConcurrentPerAvatar) {
    throw new ExternalSessionCapacityError();
  }
}

function policyLockKeys(input: PolicyLockInput) {
  const participant = input.kind === "public" ? requireParticipantEmail(input) : input.targetId;
  return [`avatar:${input.avatarId}`, `${input.kind}:${input.targetId}:${participant}`];
}

function requireParticipantEmail(input: { participantEmail?: string }) {
  if (!input.participantEmail) throw new Error("Public participant email is required");
  return input.participantEmail.trim().toLowerCase();
}

function evaluateUsage(limits: InteractionLimits, usage: UsageRecord[], now: Date, hardMaxMinutes: number) {
  if (limits.maxSessionsPer24Hours !== null && usage.length >= limits.maxSessionsPer24Hours) {
    throw new ShareSessionCountLimitError(retryAfterForCount(usage, limits.maxSessionsPer24Hours, now));
  }

  const platformSeconds = hardMaxMinutes * 60;
  const perSessionSeconds = limits.maxSessionDurationSeconds ?? platformSeconds;
  return Math.max(10, Math.min(platformSeconds, perSessionSeconds));
}

function retryAfterForCount(usage: UsageRecord[], maximum: number, now: Date) {
  const index = Math.max(0, usage.length - maximum);
  return retryAfter(usage[index]?.startedAt, now);
}

function retryAfter(startedAt: Date | undefined, now: Date) {
  if (!startedAt) return 60;
  return Math.max(1, Math.ceil((startedAt.getTime() + WINDOW_MS - now.getTime()) / 1000));
}
