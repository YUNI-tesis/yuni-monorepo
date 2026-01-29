"use client";

/**
 * LiveCall Component
 * Real-time voice conversation with AI agent using OpenAI Realtime API
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/common";
import DynamicAvatarRenderer from "@/components/DynamicAvatarRenderer";
import { CostMeter } from "@/components/CostMeter";
import { fetchWithAuth } from "@/lib/fetch-client";

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
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================================
  // WebSocket Connection
  // ============================================================================

  const connectWebSocket = () => {
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
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
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
  };

  // ============================================================================
  // Server Message Handler
  // ============================================================================

  const handleServerMessage = useCallback(async (message: any) => {
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
        await playAudioChunk(message.audio, message.format);
        break;

      case "error":
        // Ignore expected cancellation errors (they're handled gracefully)
        if (message.error?.includes("Cancellation failed")) {
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
        clearAudioQueue();
        
        // Remove last assistant message if it was incomplete
        setMessages((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].role === "assistant") {
            return prev.slice(0, -1);
          }
          return prev;
        });
        break;

      default:
        console.warn("[LiveCall] Unknown message type:", message.type);
    }
  }, []);

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
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (isMuted || wsRef.current?.readyState !== WebSocket.OPEN) {
          return;
        }

        // Get audio data
        const inputData = event.inputBuffer.getChannelData(0);
        
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
  }, [isMuted]);

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

  const playAudioChunk = useCallback(async (base64Audio: string, format?: string) => {
    try {
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
      audioQueueRef.current.push(audioBuffer);

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
    const audioBuffer = audioQueueRef.current.shift()!;
    const audioContext = playbackContextRef.current!;

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Route through analyser for avatar lip sync when available
    const analyser = playbackAnalyserRef.current;
    if (analyser) {
      source.connect(analyser);
    } else {
      source.connect(audioContext.destination);
    }

    source.onended = () => {
      playNextInQueue();
    };

    source.start();
  }, []);

  // Helper to clear audio queue and stop current playback
  const clearAudioQueue = useCallback(() => {
    console.log("[LiveCall] Clearing audio queue");
    
    // Clear queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Stop current audio playback and clear lip-sync analyser
    if (playbackContextRef.current) {
      playbackContextRef.current.close().then(() => {
        playbackContextRef.current = null;
        playbackAnalyserRef.current = null;
        setPlaybackAnalyser(null);
      }).catch(() => {
        playbackContextRef.current = null;
        playbackAnalyserRef.current = null;
        setPlaybackAnalyser(null);
      });
    }
  }, []);

  // ============================================================================
  // User Actions
  // ============================================================================

  const handleInterrupt = useCallback(() => {
    console.log("[LiveCall] Interrupt requested");
    
    // Clear audio queue locally first (immediate feedback)
    clearAudioQueue();

    // Send interrupt to server (will also cancel Realtime response)
    wsRef.current?.send(
      JSON.stringify({
        type: "interrupt",
      })
    );
  }, [clearAudioQueue]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleEndCall = useCallback(() => {
    stopRecording();
    wsRef.current?.close();
    callStartTimeRef.current = null;
    setCallDuration(0);
    onClose?.();
  }, [stopRecording, onClose]);

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
    async function loadHistory() {
      try {
        setLoadingHistory(true);
        const res = await fetchWithAuth(`/api/conversations/${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          // Load existing messages from the conversation
          const historyMessages: Message[] = data.messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }));
          setMessages(historyMessages);
          console.log(`[LiveCall] Loaded ${historyMessages.length} messages from history`);
        }
      } catch (err) {
        console.error("[LiveCall] Failed to load conversation history:", err);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadHistory();
  }, [conversationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentTranscript]);

  // ============================================================================
  // Effects
  // ============================================================================

  useEffect(() => {
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
  }, []); // Only run once on mount

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
            <DynamicAvatarRenderer
              modelPath="https://models.readyplayer.me/697b77b6fd03bbd0ce0d0506.glb"
              style={{ width: "100%", height: "100%" }}
              className="rounded-2xl overflow-hidden"
              cameraControls={false}
              playbackAnalyser={playbackAnalyser}
              lipsyncAnimation={true}
            />
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