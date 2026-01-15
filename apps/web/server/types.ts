/**
 * Type definitions for OpenAI Realtime API and WebSocket communication
 */

// ============================================================================
// OpenAI Realtime API Types
// ============================================================================

export type RealtimeModel = "gpt-4o-realtime-preview-2024-12-17";

export interface RealtimeSessionConfig {
  modalities?: ("text" | "audio")[];
  instructions?: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "none";
  input_audio_format?: "pcm16" | "g711_ulaw" | "g711_alaw";
  output_audio_format?: "pcm16" | "g711_ulaw" | "g711_alaw";
  input_audio_transcription?: {
    model?: "whisper-1";
  };
  turn_detection?: {
    type: "server_vad";
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  } | null;
  tools?: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  max_response_output_tokens?: number | "inf";
}

// ============================================================================
// Realtime Events - Server to Client
// ============================================================================

export interface RealtimeEventBase {
  event_id?: string;
}

export interface SessionCreatedEvent extends RealtimeEventBase {
  type: "session.created";
  session: {
    id: string;
    object: "realtime.session";
    model: string;
    modalities: string[];
    instructions: string;
    voice: string;
    input_audio_format: string;
    output_audio_format: string;
    turn_detection: RealtimeSessionConfig["turn_detection"];
    tools: RealtimeSessionConfig["tools"];
  };
}

export interface SessionUpdatedEvent extends RealtimeEventBase {
  type: "session.updated";
  session: SessionCreatedEvent["session"];
}

export interface InputAudioBufferSpeechStartedEvent extends RealtimeEventBase {
  type: "input_audio_buffer.speech_started";
  audio_start_ms: number;
  item_id: string;
}

export interface InputAudioBufferSpeechStoppedEvent extends RealtimeEventBase {
  type: "input_audio_buffer.speech_stopped";
  audio_end_ms: number;
  item_id: string;
}

export interface InputAudioBufferCommittedEvent extends RealtimeEventBase {
  type: "input_audio_buffer.committed";
  previous_item_id: string;
  item_id: string;
}

export interface ConversationItemInputAudioTranscriptionDeltaEvent extends RealtimeEventBase {
  type: "conversation.item.input_audio_transcription.delta";
  item_id: string;
  content_index: number;
  delta: string;
}

export interface ConversationItemInputAudioTranscriptionCompletedEvent extends RealtimeEventBase {
  type: "conversation.item.input_audio_transcription.completed";
  item_id: string;
  content_index: number;
  transcript: string;
}

export interface ConversationItemCreatedEvent extends RealtimeEventBase {
  type: "conversation.item.created";
  previous_item_id?: string;
  item: ConversationItem;
}

export interface ConversationItemCompletedEvent extends RealtimeEventBase {
  type: "conversation.item.completed";
  item: ConversationItem;
}

export interface ResponseCreatedEvent extends RealtimeEventBase {
  type: "response.created";
  response: {
    id: string;
    object: "realtime.response";
    status: "in_progress";
    output: ConversationItem[];
  };
}

export interface ResponseDoneEvent extends RealtimeEventBase {
  type: "response.done";
  response: {
    id: string;
    object: "realtime.response";
    status: "completed" | "cancelled" | "failed";
    status_details?: {
      type: string;
      error?: {
        type: string;
        message: string;
      };
    };
    output: ConversationItem[];
    usage?: {
      total_tokens: number;
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface ResponseTextDeltaEvent extends RealtimeEventBase {
  type: "response.text.delta";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseTextDoneEvent extends RealtimeEventBase {
  type: "response.text.done";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  text: string;
}

export interface ResponseAudioTranscriptDeltaEvent extends RealtimeEventBase {
  type: "response.audio_transcript.delta";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseAudioTranscriptDoneEvent extends RealtimeEventBase {
  type: "response.audio_transcript.done";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  transcript: string;
}

export interface ResponseFunctionCallArgumentsDeltaEvent extends RealtimeEventBase {
  type: "response.function_call_arguments.delta";
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  delta: string;
}

export interface ResponseFunctionCallArgumentsDoneEvent extends RealtimeEventBase {
  type: "response.function_call_arguments.done";
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  arguments: string;
}

export interface RateLimitsUpdatedEvent extends RealtimeEventBase {
  type: "rate_limits.updated";
  rate_limits: Array<{
    name: string;
    limit: number;
    remaining: number;
    reset_seconds: number;
  }>;
}

export interface RealtimeErrorEvent extends RealtimeEventBase {
  type: "error";
  error: {
    type: string;
    code: string;
    message: string;
    param?: string;
    event_id?: string;
  };
}

export type RealtimeServerEvent =
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | InputAudioBufferCommittedEvent
  | ConversationItemInputAudioTranscriptionDeltaEvent
  | ConversationItemInputAudioTranscriptionCompletedEvent
  | ConversationItemCreatedEvent
  | ConversationItemCompletedEvent
  | ResponseCreatedEvent
  | ResponseDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent
  | ResponseAudioTranscriptDeltaEvent
  | ResponseAudioTranscriptDoneEvent
  | ResponseFunctionCallArgumentsDeltaEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | RateLimitsUpdatedEvent
  | RealtimeErrorEvent;

// ============================================================================
// Realtime Events - Client to Server
// ============================================================================

export interface SessionUpdateClientEvent {
  type: "session.update";
  session: Partial<RealtimeSessionConfig>;
}

export interface InputAudioBufferAppendClientEvent {
  type: "input_audio_buffer.append";
  audio: string; // base64-encoded audio
}

export interface InputAudioBufferCommitClientEvent {
  type: "input_audio_buffer.commit";
}

export interface InputAudioBufferClearClientEvent {
  type: "input_audio_buffer.clear";
}

export interface ConversationItemCreateClientEvent {
  type: "conversation.item.create";
  previous_item_id?: string;
  item: ConversationItem;
}

export interface ResponseCreateClientEvent {
  type: "response.create";
  response?: {
    modalities?: ("text" | "audio")[];
    instructions?: string;
    voice?: string;
    output_audio_format?: string;
    tools?: RealtimeSessionConfig["tools"];
    tool_choice?: string;
    temperature?: number;
    max_output_tokens?: number | "inf";
  };
}

export interface ResponseCancelClientEvent {
  type: "response.cancel";
}

export type RealtimeClientEvent =
  | SessionUpdateClientEvent
  | InputAudioBufferAppendClientEvent
  | InputAudioBufferCommitClientEvent
  | InputAudioBufferClearClientEvent
  | ConversationItemCreateClientEvent
  | ResponseCreateClientEvent
  | ResponseCancelClientEvent;

// ============================================================================
// Conversation Item Types
// ============================================================================

export interface ConversationItem {
  id: string;
  object: "realtime.item";
  type: "message" | "function_call" | "function_call_output";
  status?: "in_progress" | "completed" | "incomplete";
  role?: "user" | "assistant" | "system";
  content?: Array<{
    type: "input_text" | "input_audio" | "text" | "audio";
    text?: string;
    audio?: string;
    transcript?: string;
  }>;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

// ============================================================================
// WebSocket Message Types (Client <-> Server)
// ============================================================================

export type CallState =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "transcribing"
  | "generating"
  | "speaking"
  | "error";

// Client to Server Messages
export interface InitMessage {
  type: "init";
  sessionId: string;
  userId: string;
  agentId: string;
  conversationId: string;
}

export interface AudioChunkMessage {
  type: "audio_chunk";
  audio: string; // base64-encoded audio
  sampleRate?: number;
  channels?: number;
}

export interface AudioEndMessage {
  type: "audio_end";
}

export interface InterruptMessage {
  type: "interrupt";
}

export type ClientMessage =
  | InitMessage
  | AudioChunkMessage
  | AudioEndMessage
  | InterruptMessage;

// Server to Client Messages
export interface ReadyMessage {
  type: "ready";
  sessionId: string;
}

export interface StateMessage {
  type: "state";
  state: CallState;
  message?: string;
}

export interface TranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
}

export interface ResponseChunkMessage {
  type: "response_chunk";
  text: string;
}

export interface AudioChunkResponseMessage {
  type: "audio_chunk";
  audio: string; // base64-encoded audio
  format?: string;
}

export interface ErrorMessage {
  type: "error";
  error: string;
  code?: string;
}

export interface MetricsMessage {
  type: "metrics";
  latency: {
    asr?: number; // Audio to transcript
    llm?: number; // Transcript to text response
    tts?: number; // Text to first audio chunk
    total?: number; // End to end
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    audio_seconds?: number;
  };
}

export type ServerMessage =
  | ReadyMessage
  | StateMessage
  | TranscriptMessage
  | ResponseChunkMessage
  | AudioChunkResponseMessage
  | ErrorMessage
  | MetricsMessage;

// ============================================================================
// Connection State Types
// ============================================================================

export interface CallConnection {
  // WebSocket connection to client
  ws: WebSocket;
  
  // Session information
  sessionId: string;
  userId: string;
  agentId: string;
  conversationId: string;
  
  // Realtime connection
  realtimeWs?: WebSocket;
  realtimeSessionId?: string;
  isRealtimeConnected: boolean;
  
  // Current state
  state: CallState;
  currentTranscript: string;
  currentResponse: string;
  
  // Audio processing
  isProcessing: boolean;
  isSpeaking: boolean;
  
  // Metrics
  metrics: {
    startTime?: number;
    asrStartTime?: number;
    llmStartTime?: number;
    ttsStartTime?: number;
  };
  
  // Cleanup
  cleanupFunctions: Array<() => void>;
}

// ============================================================================
// TTS Provider Types
// ============================================================================

export interface TTSOptions {
  voice?: string;
  voiceId?: string;
  speed?: number;
  speakingRate?: number;
}

export interface TTSProvider {
  name: "openai" | "elevenlabs";
  synthesize(text: string, options?: TTSOptions): AsyncGenerator<Buffer, void, unknown>;
}

export interface ElevenLabsVoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}
