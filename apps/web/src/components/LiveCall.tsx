"use client";

/**
 * LiveCall Component
 * Real-time voice conversation with AI agent using OpenAI Realtime API
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/common";
import { CostMeter } from "@/components/CostMeter";
import { fetchWithAuth } from "@/lib/fetch-client";
import { LiveCallAvatarStage } from "@/components/live-call/LiveCallAvatarStage";
import { useLiveCallRuntime } from "@/components/live-call/useLiveCallRuntime";
import type {
  CallState,
  ConversationHistoryResponse,
  LiveCallServerMessage,
  Message,
  SpeechRequest,
} from "@/components/live-call/types";

interface LiveCallProps {
  agentId: string;
  conversationId: string;
  userId: string;
  onClose?: () => void;
}

function getUserFriendlyCallError(message: string | null): string | null {
  if (!message) {
    return null;
  }

  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to initialize session") ||
    normalized.includes("realtime connection timeout") ||
    normalized.includes("websocket was closed before the connection was established")
  ) {
    return "No pudimos iniciar la llamada. Probá nuevamente en unos segundos.";
  }

  if (normalized.includes("microphone") || normalized.includes("micrófono")) {
    return "No pudimos acceder al micrófono.";
  }

  return message;
}

export function LiveCall({ agentId, conversationId, userId, onClose }: LiveCallProps) {
  const {
    agent,
    runtimeReady,
    runtimeError,
    avatarRuntime,
    heyGenState,
    heyGenSessionToken,
    avatarWarning,
    setAvatarWarning,
    canUseHeyGen,
  } = useLiveCallRuntime(agentId);

  const [state, setState] = useState<CallState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [playbackAnalyser, setPlaybackAnalyser] = useState<AnalyserNode | null>(null);
  const [speechRequest, setSpeechRequest] = useState<SpeechRequest | null>(null);
  const [interruptVersion, setInterruptVersion] = useState(0);
  const [disabledHeyGenKey, setDisabledHeyGenKey] = useState<string | null>(null);

  const callStartTimeRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isMutedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const sessionIdRef = useRef<string>("");
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const effectiveHeyGenRef = useRef(false);
  const stateRef = useRef<CallState>("idle");
  const playNextInQueueRef = useRef<() => void>(() => undefined);
  const playAudioChunkRef = useRef<(base64Audio: string, format?: string) => Promise<void>>(
    async () => undefined
  );
  const handleServerMessageRef = useRef<(message: LiveCallServerMessage) => Promise<void>>(
    async () => undefined
  );
  const currentHeyGenKey = `${agentId}:${heyGenSessionToken ?? "no-token"}`;

  const effectiveHeyGenEnabled = canUseHeyGen && disabledHeyGenKey !== currentHeyGenKey;

  useEffect(() => {
    effectiveHeyGenRef.current = effectiveHeyGenEnabled;
  }, [effectiveHeyGenEnabled]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const pcm16ToAudioBuffer = useCallback((arrayBuffer: ArrayBuffer, sampleRate: number): AudioBuffer => {
    const audioContext = playbackContextRef.current!;
    const pcm16 = new Int16Array(arrayBuffer);
    const audioBuffer = audioContext.createBuffer(1, pcm16.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
    }

    return audioBuffer;
  }, []);

  useEffect(() => {
    playNextInQueueRef.current = () => {
      if (audioQueueRef.current.length === 0) {
        isPlayingRef.current = false;
        return;
      }

      isPlayingRef.current = true;
      const audioBuffer = audioQueueRef.current.shift()!;
      const audioContext = playbackContextRef.current!;

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      const analyser = playbackAnalyserRef.current;
      if (analyser) {
        source.connect(analyser);
      } else {
        source.connect(audioContext.destination);
      }

      source.onended = () => {
        playNextInQueueRef.current();
      };

      source.start();
    };
  }, []);

  useEffect(() => {
    playAudioChunkRef.current = async (base64Audio: string, format?: string) => {
      try {
        if (!playbackContextRef.current) {
          const ctx = new AudioContext();
          playbackContextRef.current = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.3;
          analyser.connect(ctx.destination);
          playbackAnalyserRef.current = analyser;
          setPlaybackAnalyser(analyser);
        }

        const audioContext = playbackContextRef.current;
        const arrayBuffer = base64ToArrayBuffer(base64Audio);

        const audioBuffer =
          format === "pcm16"
            ? pcm16ToAudioBuffer(arrayBuffer, 24000)
            : await audioContext.decodeAudioData(arrayBuffer);

        audioQueueRef.current.push(audioBuffer);

        if (!isPlayingRef.current) {
          playNextInQueueRef.current();
        }
      } catch (playbackError) {
        console.error("[LiveCall] Error playing audio chunk:", playbackError);
      }
    };
  }, [pcm16ToAudioBuffer]);

  const clearAudioQueue = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    if (playbackContextRef.current) {
      void playbackContextRef.current.close().catch(() => {
        // Best effort cleanup.
      }).finally(() => {
        playbackContextRef.current = null;
        playbackAnalyserRef.current = null;
        setPlaybackAnalyser(null);
      });
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1,
        },
      });

      mediaStreamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMutedRef.current;
      });

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (isMutedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }

        wsRef.current?.send(
          JSON.stringify({
            type: "audio_chunk",
            audio: arrayBufferToBase64(pcm16.buffer),
          })
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (recordingError) {
      console.error("[LiveCall] Error starting recording:", recordingError);
      setError("No pudimos acceder al micrófono.");
      setState("error");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {
        // Ignore cleanup failures.
      });
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    handleServerMessageRef.current = async (message: LiveCallServerMessage) => {
      switch (message.type) {
        case "ready":
          setError(null);
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }

          setState("ready");
          await startRecording();
          break;

        case "state":
          if (message.state) {
            setState(message.state);
          }
          break;

        case "transcript":
          if (message.isFinal) {
            setCurrentTranscript("");
            setMessages((prev) => [
              ...prev,
              {
                role: "user",
                content: message.text || "",
                timestamp: new Date(),
              },
            ]);
          } else {
            setCurrentTranscript(message.text || "");
          }
          break;

        case "response_chunk":
          if (!message.text) {
            break;
          }
          const chunkText = message.text;

          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: lastMessage.content + chunkText,
                },
              ];
            }

            return [
              ...prev,
              {
                role: "assistant",
                content: chunkText,
                timestamp: new Date(),
              },
            ];
          });
          break;

        case "response_complete":
          if (effectiveHeyGenRef.current && message.text?.trim()) {
            setSpeechRequest({
              id: `${Date.now()}-${message.text.length}`,
              text: message.text,
            });
          }
          break;

        case "audio_chunk":
          if (!message.audio || effectiveHeyGenRef.current) {
            break;
          }

          await playAudioChunkRef.current(message.audio, message.format);
          break;

        case "audio_interrupted":
          clearAudioQueue();
          setInterruptVersion((prev) => prev + 1);
          setMessages((prev) => {
            if (prev[prev.length - 1]?.role === "assistant") {
              return prev.slice(0, -1);
            }

            return prev;
          });
          break;

        case "error":
          if (message.error?.includes("Cancellation failed")) {
            break;
          }

          setError(message.error || "La llamada encontró un error inesperado.");
          setState("error");
          break;

        case "metrics":
        default:
          break;
      }
    };
  }, [clearAudioQueue, startRecording]);

  const handleInterrupt = useCallback(() => {
    clearAudioQueue();
    setInterruptVersion((prev) => prev + 1);

    wsRef.current?.send(
      JSON.stringify({
        type: "interrupt",
      })
    );
  }, [clearAudioQueue]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }

      return next;
    });
  }, []);

  const handleEndCall = useCallback(() => {
    stopRecording();
    wsRef.current?.close();
    clearAudioQueue();
    callStartTimeRef.current = null;
    setCallDuration(0);
    onClose?.();
  }, [clearAudioQueue, onClose, stopRecording]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await fetchWithAuth(`/api/conversations/${conversationId}`);
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as ConversationHistoryResponse;
        const historyMessages: Message[] = data.messages
          .filter(
            (
              msg
            ): msg is ConversationHistoryResponse["messages"][number] & {
              role: "user" | "assistant";
            } => msg.role === "user" || msg.role === "assistant"
          )
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }));

        setMessages(historyMessages);
      } catch (historyError) {
        console.error("[LiveCall] Failed to load conversation history:", historyError);
      }
    }

    void loadHistory();
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentTranscript]);

  useEffect(() => {
    if (!runtimeReady || !agent || runtimeError) {
      return;
    }

    const configuredUrl = process.env.NEXT_PUBLIC_LIVECALL_WS_URL;
    const defaultUrl = window.location.hostname === "localhost"
      ? "ws://localhost:3001"
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001`;
    const ws = new WebSocket(configuredUrl || defaultUrl);

    ws.onopen = () => {
      if (!sessionIdRef.current) {
        sessionIdRef.current = `session_${Date.now()}`;
      }

      setState("connecting");
      ws.send(
        JSON.stringify({
          type: "init",
          sessionId: sessionIdRef.current,
          userId,
          agentId,
          conversationId,
          avatarRuntime,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as LiveCallServerMessage;
        void handleServerMessageRef.current(message);
      } catch (parseError) {
        console.error("[LiveCall] Error parsing message:", parseError);
      }
    };

    ws.onerror = () => {
      // Actual connection failures are surfaced via timeout or close handling.
    };

    ws.onclose = () => {
      setState((currentState) => (currentState === "error" ? currentState : "idle"));
    };

    wsRef.current = ws;

    connectionTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN && stateRef.current === "connecting") {
        setError("La llamada tardó demasiado en iniciar. Probá nuevamente.");
        setState("error");
        wsRef.current.close();
      }
    }, 10000);

    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }

      stopRecording();
      clearAudioQueue();
      wsRef.current?.close();
    };
  }, [agent, agentId, avatarRuntime, clearAudioQueue, conversationId, runtimeError, runtimeReady, startRecording, stopRecording, userId]);

  useEffect(() => {
    if (state === "ready" && !callStartTimeRef.current) {
      callStartTimeRef.current = Date.now();
    }

    if (state !== "idle" && state !== "connecting" && state !== "error") {
      const interval = window.setInterval(() => {
        if (callStartTimeRef.current) {
          setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
        }
      }, 1000);

      return () => window.clearInterval(interval);
    }
  }, [state]);

  useEffect(() => {
    if (effectiveHeyGenEnabled) {
      clearAudioQueue();
    }
  }, [clearAudioQueue, effectiveHeyGenEnabled]);

  const effectiveState: CallState = runtimeError ? "error" : state;
  const displayError = getUserFriendlyCallError(runtimeError || error);

  const statusText =
    effectiveState === "connecting"
      ? "Conectando..."
      : effectiveState === "error"
      ? "Error de conexión"
      : effectiveState === "idle"
      ? "Inactivo"
      : "Llamada en curso";

  const statusAccentClass =
    effectiveState === "error"
      ? "bg-red-500"
      : effectiveState === "connecting"
      ? "bg-yellow-500 animate-pulse"
      : effectiveState === "idle"
      ? "bg-gray-500"
      : "bg-green-500 animate-pulse";

  const runtimeLabel = effectiveHeyGenEnabled ? "Avatar HeyGen conectado" : "Voz realtime del agente";
  const shouldShowAvatarStage = !displayError;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gradient-to-b from-transparent to-black/20">
      <div className="glass-strong flex flex-shrink-0 items-center justify-between border-b border-theme px-6 py-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className={`h-3 w-3 rounded-full ${statusAccentClass}`} />
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{statusText}</span>
              {state !== "connecting" && state !== "error" && state !== "idle" ? (
                <span className="text-xs text-muted-theme">
                  {formatDuration(callDuration)} · {runtimeLabel}
                </span>
              ) : (
                <span className="text-xs text-muted-theme">
                  {heyGenState === "loading" ? "Preparando avatar..." : "Preparando audio..."}
                </span>
              )}
            </div>
          </div>

          <div className="border-l border-theme pl-4">
            <CostMeter conversationId={conversationId} />
          </div>
        </div>

        <Button
          onClick={handleEndCall}
          variant="destructive"
          size="sm"
          disabled={effectiveState === "idle" || effectiveState === "connecting"}
        >
          Finalizar Llamada
        </Button>
      </div>

      {avatarWarning && (
        <div className="px-6 pt-4">
          <div className="glass rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-100">{avatarWarning}</p>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="flex h-full w-full max-w-5xl items-center justify-center">
          <div className="h-full min-h-[500px] w-full overflow-hidden rounded-2xl shadow-2xl">
            {!shouldShowAvatarStage ? (
              <div className="flex h-full items-center justify-center bg-slate-950/95 p-8">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-300">
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
                      />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-white">No pudimos iniciar la llamada</h3>
                  <p className="text-sm leading-relaxed text-slate-300">
                    {displayError}
                  </p>
                </div>
              </div>
            ) : agent ? (
              <LiveCallAvatarStage
                agentName={agent.name}
                avatar={agent.avatar}
                canUseHeyGen={effectiveHeyGenEnabled}
                heyGenState={heyGenState}
                heyGenSessionToken={heyGenSessionToken}
                speechRequest={speechRequest}
                interruptVersion={interruptVersion}
                playbackAnalyser={playbackAnalyser}
                onAvatarReady={() => {
                  setAvatarWarning(null);
                }}
                onAvatarError={(message) => {
                  setDisabledHeyGenKey(currentHeyGenKey);
                  setAvatarWarning(message);
                }}
                onSpeakingChange={(speaking) => {
                  setState((current) => {
                    if (speaking) {
                      return "speaking";
                    }

                    return current === "speaking" ? "ready" : current;
                  });
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-slate-950">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-cyan-400/20 border-t-cyan-300 animate-spin" />
                  <p className="text-sm text-white">Preparando llamada...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-strong flex flex-shrink-0 items-center justify-center space-x-4 border-t border-theme px-6 py-4">
        <button
          onClick={handleToggleMute}
          className={`rounded-full p-4 transition-all ${
            isMuted
              ? "border border-red-500/30 bg-red-600/80 hover:bg-red-600"
              : "glass border border-theme hover:bg-surface-hover"
          }`}
          title={isMuted ? "Desactivar silencio" : "Silenciar"}
        >
          {isMuted ? (
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          disabled={effectiveState === "idle" || effectiveState === "connecting" || effectiveState === "error"}
          className="rounded-full border border-yellow-400/30 bg-yellow-500/80 p-4 transition-all hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
          title="Interrumpir respuesta"
        >
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      <div ref={messagesEndRef} />
    </div>
  );
}
