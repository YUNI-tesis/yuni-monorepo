"use client";

/**
 * LiveCall Component
 * Real-time voice conversation with AI agent using OpenAI Realtime API
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/common";
import { CostMeter } from "@/components/CostMeter";
import { fetchWithAuth } from "@/lib/fetch-client";
import { AgentAvatar, DEFAULT_LOCAL_AVATAR } from "@/lib/schemas";
import { Local3DAvatarRenderer } from "@/components/Local3DAvatarRenderer";
import {
  RemoteRealtimeAvatarHandle,
  RemoteRealtimeAvatarRenderer,
} from "@/components/RemoteRealtimeAvatarRenderer";

// ============================================================================
// Types
// ============================================================================

type CallState =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "transcribing"
  | "generating"
  | "speaking"
  | "error";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  interrupted?: boolean;
}

type LiveCallServerMessage =
  | { type: "ready"; sessionId: string }
  | { type: "state"; state: CallState }
  | { type: "transcript"; text: string; isFinal: boolean }
  | { type: "response_chunk"; text: string }
  | { type: "audio_chunk"; audio: string; format?: string; itemId?: string; contentIndex?: number; generationId?: string }
  | { type: "error"; error: string; code?: string }
  | { type: "metrics"; latency?: Record<string, number>; usage?: Record<string, number> }
  | { type: "audio_interrupted"; reason: "barge_in" | "manual"; itemId?: string; contentIndex?: number; generationId?: string };

interface QueuedAudioChunk {
  buffer: AudioBuffer;
  itemId?: string;
  contentIndex?: number;
  generationId?: string;
  durationMs: number;
}

interface CurrentPlayback {
  source: AudioBufferSourceNode;
  gain: GainNode;
  itemId?: string;
  contentIndex?: number;
  generationId?: string;
  startedAt: number;
  durationMs: number;
  stopped: boolean;
}

interface PlaybackTruncation {
  itemId: string;
  contentIndex: number;
  audioEndMs: number;
  generationId?: string;
}

interface RemotePlaybackEstimate {
  itemId?: string;
  contentIndex?: number;
  generationId?: string;
  startedAt: number;
  sentDurationMs: number;
}

interface ConversationPayload {
  messages: Array<{
    role: Message["role"];
    content: string;
    createdAt: string;
  }>;
}

interface LiveCallProps {
  agentId: string;
  conversationId: string;
  userId: string;
  onClose?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function LiveCall({ agentId, conversationId, userId, onClose }: LiveCallProps) {
  const [state, setState] = useState<CallState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0); // in seconds
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [agentAvatar, setAgentAvatar] = useState<AgentAvatar>(DEFAULT_LOCAL_AVATAR);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [remoteAvatarError, setRemoteAvatarError] = useState<string | null>(null);
  
  // Analyser for avatar lip sync (taps TTS playback)
  const [playbackAnalyser, setPlaybackAnalyser] = useState<AnalyserNode | null>(null);
  
  const callStartTimeRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioQueueRef = useRef<QueuedAudioChunk[]>([]);
  const currentPlaybackRef = useRef<CurrentPlayback | null>(null);
  const playedAudioByItemRef = useRef<Map<string, number>>(new Map());
  const remotePlaybackEstimateRef = useRef<RemotePlaybackEstimate | null>(null);
  const interruptedGenerationRef = useRef<string | null>(null);
  const isMutedRef = useRef(isMuted);
  const micSpeechFrameCountRef = useRef(0);
  const lastLocalBargeInAtRef = useRef(0);
  const localBargeInRef = useRef<() => void>(() => undefined);
  const isPlayingRef = useRef(false);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const remoteAvatarRef = useRef<RemoteRealtimeAvatarHandle | null>(null);

  const isRemoteAvatar = agentAvatar.provider !== "local3d";

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // ============================================================================
  // WebSocket Connection
  // ============================================================================

  const connectWebSocket = useCallback(() => {
    const ws = new WebSocket("ws://localhost:3001");

    ws.onopen = () => {
      console.log("[LiveCall] WebSocket connected");
      setState("connecting");

      // Send init message
      ws.send(
        JSON.stringify({
          type: "init",
          sessionId: sessionIdRef.current,
          userId,
          agentId,
          conversationId,
          avatarProvider: agentAvatar.provider,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as LiveCallServerMessage;
        handleServerMessage(message);
      } catch (error) {
        console.error("[LiveCall] Error parsing message:", error);
      }
    };

    ws.onerror = () => {
      // WebSocket error events are noisy and don't provide useful info
      // Actual errors will be handled via server messages or timeout
    };

    ws.onclose = () => {
      console.log("[LiveCall] WebSocket closed");
      setState("idle");
    };

    wsRef.current = ws;
  }, [agentId, agentAvatar.provider, conversationId, userId]);

  // ============================================================================
  // Server Message Handler
  // ============================================================================

  const handleServerMessage = useCallback(async (message: LiveCallServerMessage) => {
    switch (message.type) {
      case "ready":
        console.log("[LiveCall] Session ready");
        setError(null); // Clear any previous errors
        
        // Clear connection timeout
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        
        setState("ready");
        startRecording();
        break;

      case "state":
        setState(message.state);
        break;

      case "transcript":
        if (message.isFinal) {
          setCurrentTranscript("");
          setMessages((prev) => [
            ...prev,
            {
              role: "user",
              content: message.text,
              timestamp: new Date(),
            },
          ]);
        } else {
          setCurrentTranscript(message.text);
        }
        break;

      case "response_chunk":
        // Update current assistant message (streaming)
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === "assistant" && !lastMessage.content.endsWith("...")) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: lastMessage.content + message.text,
              },
            ];
          } else {
            return [
              ...prev,
              {
                role: "assistant",
                content: message.text,
                timestamp: new Date(),
              },
            ];
          }
        });
        break;

      case "audio_chunk":
        if (message.generationId && interruptedGenerationRef.current === message.generationId) {
          console.log(`[LiveCall] Discarding stale audio chunk for ${message.generationId}`);
          break;
        }

        if (isRemoteAvatar && !remoteAvatarError && remoteAvatarRef.current) {
          try {
            trackRemoteAudioChunk(message);
            await remoteAvatarRef.current.speakAudio(message.audio, message.format, message.generationId);
          } catch (error) {
            console.error("[LiveCall] Error sending audio to remote avatar:", error);
            await playAudioChunk(message.audio, message.format, message.itemId, message.contentIndex, message.generationId);
          }
        } else {
          await playAudioChunk(message.audio, message.format, message.itemId, message.contentIndex, message.generationId);
        }
        break;

      case "error":
        // Ignore expected cancellation errors (they're handled gracefully)
        if (message.error.includes("Cancellation failed")) {
          console.log("[LiveCall] Note: Cancellation attempted when no active response");
          break;
        }
        
        console.error("[LiveCall] Error:", message.error);
        setError(message.error);
        setState("error");
        break;

      case "metrics":
        console.log("[LiveCall] Metrics:", message);
        break;

      case "audio_interrupted":
        // Server detected barge-in or confirmed manual interrupt
        console.log(`[LiveCall] Audio interrupted: ${message.reason}`);
        if (message.generationId) {
          interruptedGenerationRef.current = message.generationId;
        }
        remoteAvatarRef.current?.interrupt(message.generationId).catch(() => undefined);
        sendPlaybackTruncation(clearAudioQueue(message));
        
        // Mark the visible assistant turn as interrupted without deleting the transcript blindly.
        setMessages((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].role === "assistant") {
            return [
              ...prev.slice(0, -1),
              {
                ...prev[prev.length - 1],
                interrupted: true,
              },
            ];
          }
          return prev;
        });
        break;

      default:
        console.warn("[LiveCall] Unknown message type:", (message as { type?: string }).type);
    }
  }, [isRemoteAvatar]);

  // ============================================================================
  // Audio Recording (PCM16 at 24kHz for Realtime API)
  // ============================================================================

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000, // Realtime API expects 24kHz
          channelCount: 1, // Mono
        },
      });

      mediaStreamRef.current = stream;

      // Create AudioContext for processing
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      
      // Use ScriptProcessorNode for audio processing
      // Note: ScriptProcessorNode is deprecated but widely supported
      // For production, consider using AudioWorklet
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      processorNodeRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (isMutedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) {
          return;
        }

        // Get audio data
        const inputData = event.inputBuffer.getChannelData(0);
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < inputData.length; i++) {
          const abs = Math.abs(inputData[i]);
          sumSquares += inputData[i] * inputData[i];
          if (abs > peak) peak = abs;
        }

        const rms = Math.sqrt(sumSquares / inputData.length);
        const remoteEstimate = remotePlaybackEstimateRef.current;
        const remoteLikelySpeaking = Boolean(
          remoteEstimate && Date.now() - remoteEstimate.startedAt < remoteEstimate.sentDurationMs + 1500
        );
        const outputLikelySpeaking =
          Boolean(currentPlaybackRef.current) || audioQueueRef.current.length > 0 || remoteLikelySpeaking;

        if (outputLikelySpeaking && (rms > 0.035 || peak > 0.12)) {
          micSpeechFrameCountRef.current += 1;
        } else {
          micSpeechFrameCountRef.current = 0;
        }

        if (micSpeechFrameCountRef.current >= 1 && Date.now() - lastLocalBargeInAtRef.current > 900) {
          lastLocalBargeInAtRef.current = Date.now();
          console.log(`[LiveCall] Local mic barge-in detected rms=${rms.toFixed(3)} peak=${peak.toFixed(3)}`);
          localBargeInRef.current();
        }
        
        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          // Clamp and convert to 16-bit integer
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Convert to base64
        const base64 = arrayBufferToBase64(pcm16.buffer);

        // Send to server
        wsRef.current?.send(
          JSON.stringify({
            type: "audio_chunk",
            audio: base64,
          })
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      console.log("[LiveCall] Recording started (PCM16 @ 24kHz)");
    } catch (error) {
      console.error("[LiveCall] Error starting recording:", error);
      setError("Failed to access microphone");
    }
  }, []);

  const stopRecording = useCallback(() => {
    // Stop audio processing
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    console.log("[LiveCall] Recording stopped");
  }, []);

  // Helper function to convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // ============================================================================
  // Audio Playback
  // ============================================================================

  // Helper: Convert base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Helper: Convert PCM16 to AudioBuffer
  const pcm16ToAudioBuffer = useCallback((arrayBuffer: ArrayBuffer, sampleRate: number): AudioBuffer => {
    const audioContext = playbackContextRef.current!;
    
    // PCM16 is 16-bit signed integer, 2 bytes per sample
    const pcm16 = new Int16Array(arrayBuffer);
    const audioBuffer = audioContext.createBuffer(1, pcm16.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Convert Int16 to Float32 [-1, 1]
    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
    }
    
    return audioBuffer;
  }, []);

  const getPcm16DurationMs = useCallback((base64Audio: string, sampleRate: number): number => {
    const byteLength = atob(base64Audio).length;
    return (byteLength / 2 / sampleRate) * 1000;
  }, []);

  const getPlayedMsForItem = useCallback((itemId?: string): number => {
    if (!itemId) return 0;
    const completedMs = playedAudioByItemRef.current.get(itemId) || 0;
    const current = currentPlaybackRef.current;
    if (current?.itemId !== itemId || !playbackContextRef.current) return completedMs;

    const elapsedMs = Math.max(0, (playbackContextRef.current.currentTime - current.startedAt) * 1000);
    return completedMs + Math.min(elapsedMs, current.durationMs);
  }, []);

  const buildLocalPlaybackTruncation = useCallback((
    fallback?: { itemId?: string; contentIndex?: number; generationId?: string }
  ): PlaybackTruncation | null => {
    const current = currentPlaybackRef.current;
    const itemId = current?.itemId || fallback?.itemId;
    if (!itemId) return null;

    return {
      itemId,
      contentIndex: current?.contentIndex ?? fallback?.contentIndex ?? 0,
      audioEndMs: getPlayedMsForItem(itemId),
      generationId: current?.generationId || fallback?.generationId,
    };
  }, [getPlayedMsForItem]);

  const buildRemotePlaybackTruncation = useCallback((
    fallback?: { itemId?: string; contentIndex?: number; generationId?: string }
  ): PlaybackTruncation | null => {
    const estimate = remotePlaybackEstimateRef.current;
    const itemId = estimate?.itemId || fallback?.itemId;
    if (!itemId) return null;

    const elapsedMs = estimate ? Date.now() - estimate.startedAt : 0;
    return {
      itemId,
      contentIndex: estimate?.contentIndex ?? fallback?.contentIndex ?? 0,
      audioEndMs: Math.max(0, Math.min(estimate?.sentDurationMs || 0, elapsedMs)),
      generationId: estimate?.generationId || fallback?.generationId,
    };
  }, []);

  const sendPlaybackTruncation = useCallback((truncation: PlaybackTruncation | null) => {
    if (!truncation || wsRef.current?.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "playback_truncated",
        itemId: truncation.itemId,
        contentIndex: truncation.contentIndex,
        audioEndMs: Math.max(0, Math.floor(truncation.audioEndMs)),
        generationId: truncation.generationId,
      })
    );
  }, []);

  const trackRemoteAudioChunk = useCallback((message: Extract<LiveCallServerMessage, { type: "audio_chunk" }>) => {
    if (!message.itemId) return;

    const durationMs = message.format === "pcm16" ? getPcm16DurationMs(message.audio, 24000) : 0;
    const current = remotePlaybackEstimateRef.current;
    if (!current || current.itemId !== message.itemId || current.generationId !== message.generationId) {
      remotePlaybackEstimateRef.current = {
        itemId: message.itemId,
        contentIndex: message.contentIndex ?? 0,
        generationId: message.generationId,
        startedAt: Date.now(),
        sentDurationMs: durationMs,
      };
      return;
    }

    current.sentDurationMs += durationMs;
  }, [getPcm16DurationMs]);

  const playAudioChunk = useCallback(async (
    base64Audio: string,
    format?: string,
    itemId?: string,
    contentIndex?: number,
    generationId?: string
  ) => {
    try {
      if (generationId && interruptedGenerationRef.current === generationId) {
        return;
      }

      // Initialize playback AudioContext and analyser for lip sync if needed
      if (!playbackContextRef.current) {
        const ctx = new AudioContext();
        playbackContextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048; // Higher FFT for better frequency resolution
        analyser.smoothingTimeConstant = 0.3; // Smooth transitions
        analyser.connect(ctx.destination);
        playbackAnalyserRef.current = analyser;
        setPlaybackAnalyser(analyser);
      }

      const audioContext = playbackContextRef.current;
      const arrayBuffer = base64ToArrayBuffer(base64Audio);
      
      let audioBuffer: AudioBuffer;

      if (format === "pcm16") {
        // Direct PCM16 from Realtime API
        audioBuffer = pcm16ToAudioBuffer(arrayBuffer, 24000); // Realtime uses 24kHz
      } else {
        // MP3 from separate TTS
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      }
      
      // Add to queue
      audioQueueRef.current.push({
        buffer: audioBuffer,
        itemId,
        contentIndex,
        generationId,
        durationMs: audioBuffer.duration * 1000,
      });

      // Start playing if not already playing
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    } catch (error) {
      console.error("[LiveCall] Error playing audio chunk:", error);
    }
  }, [pcm16ToAudioBuffer]);

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    const audioContext = playbackContextRef.current!;

    const source = audioContext.createBufferSource();
    source.buffer = chunk.buffer;
    const gain = audioContext.createGain();
    gain.gain.value = 1;
    
    // Route through analyser for avatar lip sync when available
    const analyser = playbackAnalyserRef.current;
    if (analyser) {
      source.connect(gain);
      gain.connect(analyser);
    } else {
      source.connect(gain);
      gain.connect(audioContext.destination);
    }

    currentPlaybackRef.current = {
      source,
      gain,
      itemId: chunk.itemId,
      contentIndex: chunk.contentIndex,
      generationId: chunk.generationId,
      startedAt: audioContext.currentTime,
      durationMs: chunk.durationMs,
      stopped: false,
    };

    source.onended = () => {
      const current = currentPlaybackRef.current;
      if (current?.source !== source) {
        return;
      }

      if (!current.stopped && current.itemId) {
        const completedMs = playedAudioByItemRef.current.get(current.itemId) || 0;
        playedAudioByItemRef.current.set(current.itemId, completedMs + current.durationMs);
      }
      currentPlaybackRef.current = null;
      playNextInQueue();
    };

    source.start();
  }, []);

  // Helper to clear audio queue and stop current playback
  const clearAudioQueue = useCallback((
    fallback?: { itemId?: string; contentIndex?: number; generationId?: string }
  ): PlaybackTruncation | null => {
    console.log("[LiveCall] Clearing audio queue");
    const truncation = isRemoteAvatar
      ? buildRemotePlaybackTruncation(fallback)
      : buildLocalPlaybackTruncation(fallback);
    const interruptedGenerationId =
      currentPlaybackRef.current?.generationId ||
      remotePlaybackEstimateRef.current?.generationId ||
      fallback?.generationId;
    if (interruptedGenerationId) {
      interruptedGenerationRef.current = interruptedGenerationId;
    }
    
    // Clear queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    remotePlaybackEstimateRef.current = null;

    const current = currentPlaybackRef.current;
    if (current && playbackContextRef.current) {
      current.stopped = true;
      const now = playbackContextRef.current.currentTime;
      try {
        current.gain.gain.cancelScheduledValues(now);
        current.gain.gain.setValueAtTime(current.gain.gain.value, now);
        current.gain.gain.linearRampToValueAtTime(0, now + 0.08);
        current.source.stop(now + 0.09);
      } catch {
        try {
          current.source.stop();
        } catch {
          // Already stopped.
        }
      }
      currentPlaybackRef.current = null;
    }

    setTimeout(() => {
      if (!currentPlaybackRef.current && audioQueueRef.current.length === 0 && playbackContextRef.current) {
        playbackContextRef.current.close().catch(() => undefined);
        playbackContextRef.current = null;
        playbackAnalyserRef.current = null;
        setPlaybackAnalyser(null);
      }
    }, 120);

    return truncation;
  }, [buildLocalPlaybackTruncation, buildRemotePlaybackTruncation, isRemoteAvatar]);

  // ============================================================================
  // User Actions
  // ============================================================================

  const handleInterrupt = useCallback(() => {
    console.log("[LiveCall] Interrupt requested");
    
    // Clear audio queue locally first (immediate feedback)
    const truncation = clearAudioQueue();
    if (truncation?.generationId) {
      interruptedGenerationRef.current = truncation.generationId;
    }

    // Send interrupt to server (will also cancel Realtime response)
    remoteAvatarRef.current?.interrupt(truncation?.generationId).catch(() => undefined);
    wsRef.current?.send(
      JSON.stringify({
        type: "interrupt",
        itemId: truncation?.itemId,
        contentIndex: truncation?.contentIndex,
        audioEndMs: truncation?.audioEndMs,
        generationId: truncation?.generationId,
      })
    );
  }, [clearAudioQueue]);

  useEffect(() => {
    localBargeInRef.current = handleInterrupt;
  }, [handleInterrupt]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleEndCall = useCallback(() => {
    stopRecording();
    remoteAvatarRef.current?.stop().catch(() => undefined);
    wsRef.current?.close();
    callStartTimeRef.current = null;
    setCallDuration(0);
    onClose?.();
  }, [stopRecording, onClose]);

  const handleRemoteAvatarError = useCallback((message: string) => {
    setRemoteAvatarError(message);
    setError(`Avatar remoto: ${message}`);
  }, []);

  const handleRemoteAvatarReady = useCallback(() => {
    setRemoteAvatarError(null);
    setError((current) => (current?.startsWith("Avatar remoto:") ? null : current));
  }, []);

  // Helper to format call duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ============================================================================
  // Load Conversation History
  // ============================================================================

  useEffect(() => {
    async function loadCallData() {
      try {
        setLoadingHistory(true);
        const [conversationRes, agentRes] = await Promise.all([
          fetchWithAuth(`/api/conversations/${conversationId}`),
          fetchWithAuth(`/api/agents/${agentId}`),
        ]);

        if (conversationRes.ok) {
          const data = (await conversationRes.json()) as ConversationPayload;
          // Load existing messages from the conversation
          const historyMessages: Message[] = data.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }));
          setMessages(historyMessages);
          console.log(`[LiveCall] Loaded ${historyMessages.length} messages from history`);
        }

        if (agentRes.ok) {
          const agent = await agentRes.json();
          setAgentAvatar(agent.avatar || DEFAULT_LOCAL_AVATAR);
        } else {
          setAgentAvatar(DEFAULT_LOCAL_AVATAR);
        }
      } catch (err) {
        console.error("[LiveCall] Failed to load call data:", err);
        setAgentAvatar(DEFAULT_LOCAL_AVATAR);
      } finally {
        setLoadingHistory(false);
        setAvatarLoaded(true);
      }
    }

    loadCallData();
  }, [agentId, conversationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentTranscript]);

  // ============================================================================
  // Effects
  // ============================================================================

  useEffect(() => {
    if (!avatarLoaded) return;

    connectWebSocket();
    
    // Set timeout to detect if server never responds
    connectionTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN && state === "connecting") {
        console.error("[LiveCall] Server connection timeout - no 'ready' message received");
        setError("Server not responding. Please try again.");
        setState("error");
        wsRef.current.close();
      }
    }, 10000); // 10 second timeout

    return () => {
      // Clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      // Cleanup on unmount
      if (processorNodeRef.current) {
        processorNodeRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (playbackContextRef.current) {
        playbackContextRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarLoaded, connectWebSocket]); // Connect after avatar config is known

  // Call duration timer
  useEffect(() => {
    // Start timer when call becomes active
    if (state === "ready" && !callStartTimeRef.current) {
      callStartTimeRef.current = Date.now();
    }

    // Update duration every second for active calls
    if (state !== "idle" && state !== "connecting" && state !== "error") {
      const interval = setInterval(() => {
        if (callStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
          setCallDuration(elapsed);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [state]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-transparent to-black/20 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 glass-strong">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div
              className={`w-3 h-3 rounded-full ${
                state === "error"
                  ? "bg-red-500"
                  : state === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : state === "idle"
                  ? "bg-gray-500"
                  : "bg-green-500 animate-pulse"
              }`}
            />
            <div className="flex flex-col">
              <span className="font-medium text-white">
                {state === "connecting" && "Conectando..."}
                {state === "error" && "Error de conexión"}
                {state === "idle" && "Inactivo"}
                {state !== "connecting" && state !== "error" && state !== "idle" && "Llamada en curso"}
              </span>
              {state !== "connecting" && state !== "error" && state !== "idle" && (
                <span className="text-xs text-gray-400">
                  {formatDuration(callDuration)}
                </span>
              )}
            </div>
          </div>

          {/* Cost Meter */}
          <div className="border-l border-white/10 pl-4">
            <CostMeter conversationId={conversationId} />
          </div>
        </div>

        <Button
          onClick={handleEndCall}
          variant="destructive"
          size="sm"
          disabled={state === "idle" || state === "connecting"}
        >
          Finalizar Llamada
        </Button>
      </div>

      {/* Main Content - Avatar Only (Full Screen) */}
      <div className="flex-1 flex items-center justify-center min-h-0 p-8">
        <div className="w-full h-full max-w-5xl flex items-center justify-center">
          <div className="w-full h-full min-h-[500px] rounded-2xl overflow-hidden shadow-2xl">
            {isRemoteAvatar ? (
              <RemoteRealtimeAvatarRenderer
                ref={remoteAvatarRef}
                agentId={agentId}
                conversationId={conversationId}
                onReady={handleRemoteAvatarReady}
                onError={handleRemoteAvatarError}
              />
            ) : (
              <Local3DAvatarRenderer
                modelPath={agentAvatar.fallbackModelPath || DEFAULT_LOCAL_AVATAR.fallbackModelPath}
                playbackAnalyser={playbackAnalyser}
                lipsyncAnimation={true}
              />
            )}
          </div>
        </div>
      </div>

      {/* Controls - Fixed at Bottom */}
      <div className="flex-shrink-0 flex items-center justify-center space-x-4 px-6 py-4 border-t border-white/10 glass-strong">
        <button
          onClick={handleToggleMute}
          className={`p-4 rounded-full transition-all ${
            isMuted
              ? "bg-red-600/80 hover:bg-red-600 border border-red-500/30"
              : "glass border border-white/10 hover:bg-white/10"
          }`}
          title={isMuted ? "Desactivar silencio" : "Silenciar"}
        >
          {isMuted ? (
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
              />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          )}
        </button>

        <button
          onClick={handleInterrupt}
          disabled={state === "idle" || state === "connecting" || state === "error"}
          className="p-4 rounded-full bg-yellow-500/80 hover:bg-yellow-500 border border-yellow-400/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Interrumpir respuesta"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
