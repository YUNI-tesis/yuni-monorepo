import { z } from "zod";

export const VoiceSessionTranscriptEntrySchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type VoiceSessionTranscriptEntry = z.infer<typeof VoiceSessionTranscriptEntrySchema>;

export const EndVoiceSessionInputSchema = z.strictObject({
  transcript: z.array(VoiceSessionTranscriptEntrySchema).max(200).default([]),
});

export type EndVoiceSessionInput = z.infer<typeof EndVoiceSessionInputSchema>;
