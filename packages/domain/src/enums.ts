import { z } from "zod";

export const AvatarStatusSchema = z.enum(["draft", "active", "disabled"]);
export type AvatarStatus = z.infer<typeof AvatarStatusSchema>;

export const AgentProviderSchema = z.enum(["elevenlabs_agents", "openai_realtime", "none"]);
export type AgentProvider = z.infer<typeof AgentProviderSchema>;

export const ProviderSyncStatusSchema = z.enum(["not_synced", "synced", "failed"]);
export type ProviderSyncStatus = z.infer<typeof ProviderSyncStatusSchema>;

export const ShareLinkStatusSchema = z.enum(["enabled", "disabled"]);
export type ShareLinkStatus = z.infer<typeof ShareLinkStatusSchema>;

export const AccessGrantStatusSchema = z.enum(["active", "revoked"]);
export type AccessGrantStatus = z.infer<typeof AccessGrantStatusSchema>;

export const ConversationVisibilitySchema = z.enum(["private", "public"]);
export type ConversationVisibility = z.infer<typeof ConversationVisibilitySchema>;

export const ConversationModeSchema = z.enum(["text", "voice"]);
export type ConversationMode = z.infer<typeof ConversationModeSchema>;

export const ConversationStatusSchema = z.enum(["active", "ended"]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const PublicSessionStatusSchema = z.enum(["active", "ended", "blocked", "errored"]);
export type PublicSessionStatus = z.infer<typeof PublicSessionStatusSchema>;

export const RealtimeSessionStatusSchema = z.enum(["connecting", "active", "ended", "errored"]);
export type RealtimeSessionStatus = z.infer<typeof RealtimeSessionStatusSchema>;

export const DocumentStatusSchema = z.enum(["uploaded", "ingesting", "ready", "failed"]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const UsageOperationSchema = z.enum(["chat_completion", "embedding", "stt", "tts", "live_avatar"]);
export type UsageOperation = z.infer<typeof UsageOperationSchema>;

export const JobTypeSchema = z.enum(["document_ingest", "session_cleanup"]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "done", "failed"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;
