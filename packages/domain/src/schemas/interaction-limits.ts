import { z } from "zod";

const NullableBoundedInteger = (minimum: number, maximum: number) =>
  z.number().int().min(minimum).max(maximum).nullable();

export const InteractionLimitsSchema = z.strictObject({
  maxSessionDurationSeconds: NullableBoundedInteger(10, 60 * 60),
  maxSessionsPer24Hours: NullableBoundedInteger(1, 100),
});

export type InteractionLimits = z.infer<typeof InteractionLimitsSchema>;

export const UnlimitedInteractionLimits: InteractionLimits = {
  maxSessionDurationSeconds: null,
  maxSessionsPer24Hours: null,
};
