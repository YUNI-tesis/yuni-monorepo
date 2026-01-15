"use client";

/**
 * LiveCall Component
 * Real-time voice conversation with AI agent using OpenAI Realtime API
 */

import { useState, useEffect, useRef, useCallback } from "react";

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

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);

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

    ws.onerror = (error) => {
      console.error("[LiveCall] WebSocket error:", error);
      setError("Connection error");
      setState("error");
    };

    ws.onclose = () => {
      console.log("[LiveCall] WebSocket closed");
      setState("idle");
      stopRecording();
    };

    wsRef.current = ws;
  }, [agentId, conversationId, userId]);

  // ============================================================================
  // Server Message Handler
  // ============================================================================

  const handleServerMessage = useCallback(async (message: any) => {
    switch (message.type) {
      case "ready":
        console.log("[LiveCall] Session ready");
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
        await playAudioChunk(message.audio);
        break;

      case "error":
        console.error("[LiveCall] Error:", message.error);
        setError(message.error);
        setState("error");
        break;

      case "metrics":
        console.log("[LiveCall] Metrics:", message);
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

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    try {
      // Initialize playback AudioContext if needed (separate from recording context)
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext();
      }

      const audioContext = playbackContextRef.current;

      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio data (MP3 from TTS)
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      
      // Add to queue
      audioQueueRef.current.push(audioBuffer);

      // Start playing if not already playing
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    } catch (error) {
      console.error("[LiveCall] Error playing audio chunk:", error);
    }
  }, []);

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
    source.connect(audioContext.destination);

    source.onended = () => {
      playNextInQueue();
    };

    source.start();
  }, []);

  // ============================================================================
  // User Actions
  // ============================================================================

  const handleInterrupt = useCallback(() => {
    console.log("[LiveCall] Interrupt requested");
    
    // Clear audio queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Stop current audio playback
    if (playbackContextRef.current) {
      playbackContextRef.current.close().then(() => {
        playbackContextRef.current = null;
      }).catch(() => {
        // Context already closed
      });
    }

    // Send interrupt to server
    wsRef.current?.send(
      JSON.stringify({
        type: "interrupt",
      })
    );
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleEndCall = useCallback(() => {
    stopRecording();
    wsRef.current?.close();
    onClose?.();
  }, [stopRecording, onClose]);

  // ============================================================================
  // Effects
  // ============================================================================

  useEffect(() => {
    connectWebSocket();

    return () => {
      stopRecording();
      wsRef.current?.close();
      playbackContextRef.current?.close();
    };
  }, [connectWebSocket, stopRecording]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white dark:bg-gray-800">
        <div className="flex items-center space-x-3">
          <div
            className={`w-3 h-3 rounded-full ${
              state === "ready" || state === "listening"
                ? "bg-green-500 animate-pulse"
                : state === "error"
                ? "bg-red-500"
                : "bg-yellow-500"
            }`}
          />
          <span className="font-medium text-gray-900 dark:text-white">
            {state === "connecting" && "Connecting..."}
            {state === "ready" && "Ready"}
            {state === "listening" && "Listening..."}
            {state === "transcribing" && "Processing..."}
            {state === "generating" && "Thinking..."}
            {state === "speaking" && "Speaking..."}
            {state === "error" && "Error"}
            {state === "idle" && "Idle"}
          </span>
        </div>

        <button
          onClick={handleEndCall}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
        >
          End Call
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              }`}
            >
              <p className="text-sm">{message.content}</p>
              <span className="text-xs opacity-70 mt-1 block">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}

        {/* Current transcript */}
        {currentTranscript && (
          <div className="flex justify-end">
            <div className="max-w-[70%] rounded-lg p-3 bg-blue-400 text-white opacity-75">
              <p className="text-sm">{currentTranscript}</p>
              <span className="text-xs opacity-70 mt-1 block">Listening...</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex justify-center">
            <div className="rounded-lg p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center space-x-4 p-6 bg-white dark:bg-gray-800 border-t">
        <button
          onClick={handleToggleMute}
          className={`p-4 rounded-full ${
            isMuted
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
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
            <svg className="w-6 h-6 text-gray-900 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          disabled={state !== "speaking" && state !== "generating"}
          className="p-4 rounded-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Interrupt"
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
