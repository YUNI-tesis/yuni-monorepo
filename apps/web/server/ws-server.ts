/**
 * WebSocket Server for Voice Calls
 * Orchestrates: Client WebSocket <-> OpenAI Realtime API <-> TTS Provider
 */

import WebSocket, { WebSocketServer } from "ws";
import { PrismaClient } from "@prisma/client";
import { RealtimeClient } from "./realtime-client";
import { synthesizeWithAgentVoice } from "./tts-providers";
import { buildSystemPrompt } from "../src/lib/agent-utils";
import type {
  CallConnection,
  ClientMessage,
  ServerMessage,
  CallState,
  RealtimeServerEvent,
  RealtimeSessionConfig,
  VoiceMode,
  OpenAIRealtimeVoice,
} from "./types";

const prisma = new PrismaClient();

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const PORT = parseInt(process.env.WS_PORT || "3001");

// Active connections
const connections = new Map<string, CallConnection>();

// OpenAI Realtime voices (for direct audio)
const OPENAI_REALTIME_VOICES: OpenAIRealtimeVoice[] = [
  "alloy", "ash", "ballad", "coral", "echo", 
  "sage", "shimmer", "verse", "marin", "cedar"
];

// ============================================================================
// WebSocket Server Setup
// ============================================================================

export function startWebSocketServer() {
  const wss = new WebSocketServer({ port: PORT });

  console.log(`[WebSocket] Server listening on port ${PORT}`);

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WebSocket] New client connected");

    ws.on("message", async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        await handleClientMessage(ws, message);
      } catch (error) {
        console.error("[WebSocket] Error handling message:", error);
        sendToClient(ws, {
          type: "error",
          error: "Failed to process message",
        });
      }
    });

    ws.on("close", () => {
      console.log("[WebSocket] Client disconnected");
      const connection = findConnectionByWs(ws);
      if (connection) {
        cleanupConnection(connection);
      }
    });

    ws.on("error", (error) => {
      console.error("[WebSocket] Error:", error);
    });
  });

  return wss;
}

// ============================================================================
// Message Handlers
// ============================================================================

async function handleClientMessage(ws: WebSocket, message: ClientMessage): Promise<void> {
  switch (message.type) {
    case "init":
      await handleInit(ws, message);
      break;
    case "audio_chunk":
      await handleAudioChunk(ws, message);
      break;
    case "audio_end":
      await handleAudioEnd(ws, message);
      break;
    case "interrupt":
      await handleInterrupt(ws, message);
      break;
    default:
      console.warn(`[WebSocket] Unknown message type: ${(message as any).type}`);
  }
}

// ============================================================================
// Voice Mode Detection
// ============================================================================

function determineVoiceMode(agentVoice: any): {
  mode: VoiceMode;
  config: Partial<RealtimeSessionConfig>;
} {
  const voiceConfig = agentVoice as {
    provider?: "openai" | "elevenlabs";
    voiceId?: string;
    speakingRate?: number;
  };

  // Check if using OpenAI Realtime voice (low latency)
  if (
    voiceConfig?.provider === "openai" &&
    voiceConfig?.voiceId &&
    OPENAI_REALTIME_VOICES.includes(voiceConfig.voiceId as OpenAIRealtimeVoice)
  ) {
    console.log(`[Voice Mode] Using Realtime Audio (low latency) with voice: ${voiceConfig.voiceId}`);
    return {
      mode: "realtime_audio",
      config: {
        modalities: ["text", "audio"], // Enable audio output
        voice: voiceConfig.voiceId as OpenAIRealtimeVoice,
        output_audio_format: "pcm16",
      },
    };
  }

  // Fallback to separate TTS (for ElevenLabs or custom voices)
  console.log(`[Voice Mode] Using Separate TTS (flexible) with provider: ${voiceConfig?.provider || "default"}`);
  return {
    mode: "separate_tts",
    config: {
      modalities: ["text"], // Only text output
    },
  };
}

// ============================================================================
// Init Handler
// ============================================================================

async function handleInit(ws: WebSocket, message: ClientMessage & { type: "init" }): Promise<void> {
  try {
    const { sessionId, userId, agentId, conversationId } = message;

    // Fetch agent from database
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      sendToClient(ws, {
        type: "error",
        error: "Agent not found",
      });
      return;
    }

    // Determine voice mode
    const { mode, config: voiceModeConfig } = determineVoiceMode(agent.voice);

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      context: agent.context,
      toolsAllowed: agent.toolsAllowed as any,
      voice: agent.voice as any,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    });

    // Create call connection
    const connection: CallConnection = {
      ws,
      sessionId,
      userId,
      agentId,
      conversationId,
      isRealtimeConnected: false,
      voiceMode: mode,
      state: "connecting",
      currentTranscript: "",
      currentResponse: "",
      isProcessing: false,
      isSpeaking: false,
      hasActiveResponse: false,
      metrics: {
        firstAudioChunk: false,
      },
      cleanupFunctions: [],
    };

    connections.set(sessionId, connection);

    // Create Realtime client with appropriate config
    const realtimeClient = new RealtimeClient({
      apiKey: OPENAI_API_KEY,
      sessionConfig: {
        ...voiceModeConfig,
        instructions: systemPrompt,
        input_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        temperature: 0.8,
        max_response_output_tokens: "inf",
      },
      onEvent: (event) => handleRealtimeEvent(connection, event),
      onError: (error) => {
        console.error("[Realtime] Error:", error);
        sendToClient(connection.ws, {
          type: "error",
          error: error.message,
        });
        updateConnectionState(connection, "error");
      },
      onClose: () => {
        console.log("[Realtime] Connection closed");
        connection.isRealtimeConnected = false;
      },
    });

    // Connect to Realtime
    await realtimeClient.connect();
    connection.realtimeWs = realtimeClient as any;
    connection.isRealtimeConnected = true;

    // Store cleanup function
    connection.cleanupFunctions.push(() => realtimeClient.close());

    // Send ready message
    updateConnectionState(connection, "ready");
    sendToClient(ws, {
      type: "ready",
      sessionId,
    });

    console.log(`[WebSocket] Session initialized: ${sessionId}`);
  } catch (error) {
    console.error("[WebSocket] Init error:", error);
    sendToClient(ws, {
      type: "error",
      error: "Failed to initialize session",
    });
  }
}

// ============================================================================
// Audio Chunk Handler
// ============================================================================

async function handleAudioChunk(
  ws: WebSocket,
  message: ClientMessage & { type: "audio_chunk" }
): Promise<void> {
  const connection = findConnectionByWs(ws);
  if (!connection) {
    console.error("[WebSocket] No connection found for audio chunk");
    return;
  }

  if (!connection.isRealtimeConnected) {
    console.error("[WebSocket] Realtime not connected");
    return;
  }

  const realtimeClient = connection.realtimeWs as any as RealtimeClient;

  try {
    // Update state if not listening
    if (connection.state !== "listening") {
      updateConnectionState(connection, "listening");
      connection.metrics.asrStartTime = Date.now();
    }

    // Send audio to Realtime
    // Note: message.audio is already base64-encoded
    realtimeClient.appendAudio(message.audio);
  } catch (error) {
    console.error("[WebSocket] Error sending audio chunk:", error);
  }
}

// ============================================================================
// Audio End Handler
// ============================================================================

async function handleAudioEnd(
  ws: WebSocket,
  message: ClientMessage & { type: "audio_end" }
): Promise<void> {
  const connection = findConnectionByWs(ws);
  if (!connection) return;

  if (!connection.isRealtimeConnected) return;

  const realtimeClient = connection.realtimeWs as any as RealtimeClient;

  try {
    // Commit audio buffer
    realtimeClient.commitAudio();
    updateConnectionState(connection, "transcribing");
  } catch (error) {
    console.error("[WebSocket] Error committing audio:", error);
  }
}

// ============================================================================
// Interrupt Handler
// ============================================================================

async function handleInterrupt(
  ws: WebSocket,
  message: ClientMessage & { type: "interrupt" }
): Promise<void> {
  const connection = findConnectionByWs(ws);
  if (!connection) return;

  console.log(`[WebSocket] Interrupt requested: ${connection.sessionId}`);

  try {
    // Cancel Realtime response if there's an active response
    if (connection.isRealtimeConnected && connection.hasActiveResponse) {
      const realtimeClient = connection.realtimeWs as any as RealtimeClient;
      realtimeClient.cancelResponse();
      connection.hasActiveResponse = false;
    }

    // Stop TTS playback
    connection.isSpeaking = false;
    connection.currentResponse = "";

    // Notify client that audio was interrupted (confirmation)
    sendToClient(connection.ws, {
      type: "audio_interrupted",
      reason: "manual",
    });

    // Update state back to listening
    updateConnectionState(connection, "listening");
  } catch (error) {
    console.error("[WebSocket] Error handling interrupt:", error);
  }
}

// ============================================================================
// Realtime Event Handler
// ============================================================================

async function handleRealtimeEvent(
  connection: CallConnection,
  event: RealtimeServerEvent
): Promise<void> {
  switch (event.type) {
    case "session.created":
      connection.realtimeSessionId = event.session.id;
      break;

    case "input_audio_buffer.speech_started":
      console.log("[Realtime] Speech started");
      updateConnectionState(connection, "listening");
      
      // If currently speaking or has active response, this is a barge-in
      if (connection.isSpeaking || connection.hasActiveResponse) {
        console.log("[Realtime] Barge-in detected");
        const realtimeClient = connection.realtimeWs as any as RealtimeClient;
        
        // Only cancel if there's an active response
        if (connection.hasActiveResponse) {
          realtimeClient.cancelResponse();
          connection.hasActiveResponse = false;
        }
        
        connection.isSpeaking = false;
        
        // Notify client to clear audio queue
        sendToClient(connection.ws, {
          type: "audio_interrupted",
          reason: "barge_in",
        });
      }
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("[Realtime] Speech stopped");
      updateConnectionState(connection, "transcribing");
      break;

    case "conversation.item.input_audio_transcription.delta":
      // Incremental transcription
      sendToClient(connection.ws, {
        type: "transcript",
        text: event.delta,
        isFinal: false,
      });
      break;

    case "conversation.item.input_audio_transcription.completed":
      // Final transcription
      connection.currentTranscript = event.transcript;
      sendToClient(connection.ws, {
        type: "transcript",
        text: event.transcript,
        isFinal: true,
      });

      // Save transcript to database
      await saveTranscript(connection, event.transcript);

      // Calculate ASR latency
      if (connection.metrics.asrStartTime) {
        const asrLatency = Date.now() - connection.metrics.asrStartTime;
        console.log(`[Metrics] ASR latency: ${asrLatency}ms`);
      }

      updateConnectionState(connection, "generating");
      connection.metrics.llmStartTime = Date.now();
      break;

    case "response.text.delta":
      // Streaming text response
      connection.hasActiveResponse = true; // Mark response as active
      sendToClient(connection.ws, {
        type: "response_chunk",
        text: event.delta,
      });
      connection.currentResponse += event.delta;
      break;

    case "response.text.done":
      // Complete text response
      connection.currentResponse = event.text;
      console.log(`[Realtime] Text response complete: "${event.text}"`);

      // Calculate LLM latency
      if (connection.metrics.llmStartTime) {
        const llmLatency = Date.now() - connection.metrics.llmStartTime;
        console.log(`[Metrics] LLM latency: ${llmLatency}ms`);
      }

      // Only start TTS if in separate_tts mode
      if (connection.voiceMode === "separate_tts") {
        await synthesizeAndStreamAudio(connection, event.text);
      }
      break;

    case "response.audio.delta":
      // Audio chunk from Realtime (only in realtime_audio mode)
      if (connection.voiceMode === "realtime_audio") {
        connection.hasActiveResponse = true; // Mark response as active
        
        if (!connection.metrics.firstAudioChunk) {
          const totalLatency = Date.now() - (connection.metrics.asrStartTime || Date.now());
          console.log(`[Metrics] Total latency (realtime audio): ${totalLatency}ms`);
          connection.metrics.firstAudioChunk = true;
          connection.metrics.ttsStartTime = Date.now();
        }

        // Send audio chunk directly to client
        sendToClient(connection.ws, {
          type: "audio_chunk",
          audio: event.delta, // Already base64-encoded PCM16
          format: "pcm16",
        });
        
        connection.isSpeaking = true;
        if (connection.state !== "speaking") {
          updateConnectionState(connection, "speaking");
        }
      }
      break;

    case "response.audio.done":
      // Audio complete from Realtime (only in realtime_audio mode)
      if (connection.voiceMode === "realtime_audio") {
        console.log("[Realtime] Audio response complete");
        
        // Save assistant message
        if (connection.currentResponse) {
          await saveMessage(connection, "assistant", connection.currentResponse);
        }
        
        // Update state back to ready
        if (connection.isSpeaking) {
          connection.isSpeaking = false;
          updateConnectionState(connection, "ready");
        }
      }
      break;

    case "response.audio_transcript.done":
      // Transcript of audio generated by Realtime (useful for displaying text)
      if (connection.voiceMode === "realtime_audio") {
        connection.currentResponse = event.transcript;
        // Send text chunk to show in UI while audio plays
        sendToClient(connection.ws, {
          type: "response_chunk",
          text: event.transcript,
        });
      }
      break;

    case "response.done":
      // Response complete - mark as no longer active
      connection.hasActiveResponse = false;
      
      if (event.response.status === "completed") {
        console.log("[Realtime] Response completed");
      } else if (event.response.status === "cancelled") {
        console.log("[Realtime] Response cancelled");
      } else if (event.response.status === "failed") {
        console.error("[Realtime] Response failed:", event.response.status_details);
        sendToClient(connection.ws, {
          type: "error",
          error: event.response.status_details?.error?.message || "Response failed",
        });
      }

      // Save usage metrics
      if (event.response.usage) {
        await updateConversationCost(connection, event.response.usage);
        
        sendToClient(connection.ws, {
          type: "metrics",
          latency: {},
          usage: {
            input_tokens: event.response.usage.input_tokens,
            output_tokens: event.response.usage.output_tokens,
          },
        });
      }

      break;

    case "error":
      // Ignore expected cancellation errors (handled gracefully)
      if (event.error.message?.includes("no active response") || 
          event.error.message?.includes("Cancellation failed")) {
        console.log("[Realtime] Note: Cancellation attempted with no active response (expected)");
        break;
      }
      
      console.error("[Realtime] Error event:", event.error);
      sendToClient(connection.ws, {
        type: "error",
        error: event.error.message,
        code: event.error.code,
      });
      updateConnectionState(connection, "error");
      break;

    default:
      // Ignore other events
      break;
  }
}

// ============================================================================
// TTS Synthesis
// ============================================================================

async function synthesizeAndStreamAudio(connection: CallConnection, text: string): Promise<void> {
  try {
    updateConnectionState(connection, "speaking");
    connection.isSpeaking = true;
    connection.metrics.ttsStartTime = Date.now();

    // Fetch agent for voice config
    const agent = await prisma.agent.findUnique({
      where: { id: connection.agentId },
    });

    if (!agent) {
      throw new Error("Agent not found");
    }

    const voiceConfig = agent.voice as any;

    // Generate and stream audio
    const audioGenerator = synthesizeWithAgentVoice(
      text,
      voiceConfig,
      OPENAI_API_KEY,
      ELEVENLABS_API_KEY
    );

    let isFirstChunk = true;

    for await (const audioChunk of audioGenerator) {
      // Check if interrupted
      if (!connection.isSpeaking) {
        console.log("[TTS] Playback interrupted");
        break;
      }

      if (isFirstChunk) {
        const ttsLatency = Date.now() - (connection.metrics.ttsStartTime || Date.now());
        console.log(`[Metrics] TTS first chunk latency: ${ttsLatency}ms`);
        isFirstChunk = false;
      }

      // Send audio chunk to client
      sendToClient(connection.ws, {
        type: "audio_chunk",
        audio: audioChunk.toString("base64"),
        format: "mp3",
      });
    }

    // Save assistant message to database
    await saveMessage(connection, "assistant", text);

    // Update state back to ready
    if (connection.isSpeaking) {
      connection.isSpeaking = false;
      updateConnectionState(connection, "ready");
    }
  } catch (error) {
    console.error("[TTS] Error:", error);
    sendToClient(connection.ws, {
      type: "error",
      error: "TTS synthesis failed",
    });
    updateConnectionState(connection, "error");
  }
}

// ============================================================================
// Database Operations
// ============================================================================

async function saveTranscript(connection: CallConnection, transcript: string): Promise<void> {
  try {
    await prisma.transcript.create({
      data: {
        conversationId: connection.conversationId,
        transcript,
      },
    });

    // Also save as user message
    await saveMessage(connection, "user", transcript);
  } catch (error) {
    console.error("[DB] Error saving transcript:", error);
  }
}

async function saveMessage(
  connection: CallConnection,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  try {
    await prisma.message.create({
      data: {
        conversationId: connection.conversationId,
        role,
        content,
      },
    });
  } catch (error) {
    console.error("[DB] Error saving message:", error);
  }
}

async function updateConversationCost(
  connection: CallConnection,
  usage: {
    input_tokens: number;
    output_tokens: number;
  }
): Promise<void> {
  try {
    // GPT-4o Realtime pricing (approximate)
    const inputCostPer1M = 5.0; // $5 per 1M input tokens
    const outputCostPer1M = 15.0; // $15 per 1M output tokens

    const inputCost = (usage.input_tokens / 1_000_000) * inputCostPer1M;
    const outputCost = (usage.output_tokens / 1_000_000) * outputCostPer1M;
    const totalCost = inputCost + outputCost;

    await prisma.conversation.update({
      where: { id: connection.conversationId },
      data: {
        tokensIn: { increment: usage.input_tokens },
        tokensOut: { increment: usage.output_tokens },
        costUsd: { increment: totalCost },
      },
    });
  } catch (error) {
    console.error("[DB] Error updating conversation cost:", error);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function findConnectionByWs(ws: WebSocket): CallConnection | undefined {
  for (const connection of connections.values()) {
    if (connection.ws === ws) {
      return connection;
    }
  }
  return undefined;
}

function updateConnectionState(connection: CallConnection, state: CallState): void {
  connection.state = state;
  sendToClient(connection.ws, {
    type: "state",
    state,
  });
}

function sendToClient(ws: WebSocket, message: ServerMessage): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  } catch (error) {
    console.error("[WebSocket] Error sending message to client:", error);
  }
}

function cleanupConnection(connection: CallConnection): void {
  console.log(`[WebSocket] Cleaning up connection: ${connection.sessionId}`);
  
  // Run all cleanup functions
  connection.cleanupFunctions.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      console.error("[WebSocket] Error during cleanup:", error);
    }
  });

  // Remove from connections map
  connections.delete(connection.sessionId);
}

// ============================================================================
// Start Server (if run directly)
// ============================================================================

if (require.main === module) {
  startWebSocketServer();
}
