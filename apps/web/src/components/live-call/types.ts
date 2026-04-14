"use client";

import type { Agent } from "@/lib/schemas";

export type CallState =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "transcribing"
  | "generating"
  | "speaking"
  | "error";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ConversationHistoryMessage {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ConversationHistoryResponse {
  messages: ConversationHistoryMessage[];
}

export interface LiveCallServerMessage {
  type: string;
  state?: CallState;
  isFinal?: boolean;
  text?: string;
  audio?: string;
  format?: string;
  error?: string;
  reason?: string;
}

export interface SpeechRequest {
  id: string;
  text: string;
}

export type AvatarRuntime = "builtin" | "heygen";

export type HeyGenRuntimeState = "idle" | "loading" | "ready" | "failed";

export interface LiveCallRuntime {
  agent: Agent | null;
  runtimeReady: boolean;
  runtimeError: string | null;
  avatarRuntime: AvatarRuntime;
  heyGenState: HeyGenRuntimeState;
  heyGenSessionToken: string | null;
  avatarWarning: string | null;
  setAvatarWarning: (warning: string | null) => void;
  canUseHeyGen: boolean;
}
