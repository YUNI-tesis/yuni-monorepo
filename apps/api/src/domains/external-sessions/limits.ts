import { UnlimitedInteractionLimits, type InteractionLimits } from "@yuni/domain";

export type InteractionLimitRecord = {
  maxSessionDurationSeconds?: number | null;
  maxSessionsPer24Hours?: number | null;
};

export function toInteractionLimits(record?: InteractionLimitRecord | null): InteractionLimits {
  if (!record) return { ...UnlimitedInteractionLimits };
  return {
    maxSessionDurationSeconds: record.maxSessionDurationSeconds ?? null,
    maxSessionsPer24Hours: record.maxSessionsPer24Hours ?? null,
  };
}
