import { z } from "zod";

export const VOICE_SESSION_TRANSCRIPT_MAX_MESSAGES = 200;
export const VOICE_SESSION_TRANSCRIPT_MAX_CONTENT_LENGTH = 1000;
export const VOICE_SESSION_END_BODY_MAX_BYTES = 256 * 1024;

export const VoiceSessionTranscriptEntrySchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(VOICE_SESSION_TRANSCRIPT_MAX_CONTENT_LENGTH),
});

export type VoiceSessionTranscriptEntry = z.infer<typeof VoiceSessionTranscriptEntrySchema>;

export const EndVoiceSessionInputSchema = z.strictObject({
  transcript: z
    .array(VoiceSessionTranscriptEntrySchema)
    .max(VOICE_SESSION_TRANSCRIPT_MAX_MESSAGES)
    .default([]),
});

export type EndVoiceSessionInput = z.infer<typeof EndVoiceSessionInputSchema>;
