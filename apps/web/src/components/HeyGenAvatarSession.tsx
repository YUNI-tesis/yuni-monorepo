"use client";

import { useEffect, useRef, useState } from "react";
import {
  AgentEventsEnum,
  LiveAvatarSession,
  SessionDisconnectReason,
  SessionEvent,
  SessionState,
} from "@heygen/liveavatar-web-sdk";
import type { AgentAvatar } from "@/lib/schemas";
import { AgentAvatarPreview } from "@/components/AgentAvatarPreview";

let activeLiveAvatarSession: LiveAvatarSession | null = null;
let activeLiveAvatarStopPromise: Promise<void> | null = null;

interface SpeechRequest {
  id: string;
  text: string;
}

interface HeyGenAvatarSessionProps {
  sessionToken: string;
  avatar: AgentAvatar;
  agentName: string;
  speechRequest: SpeechRequest | null;
  interruptVersion: number;
  onReady?: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onError?: (message: string) => void;
  className?: string;
}

function getReadableSessionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "No pudimos iniciar la llamada";

  if (message.toLowerCase().includes("session concurrency limit reached")) {
    return "Ya hay otra llamada con este avatar abierta. Cerrala e intentá de nuevo en unos segundos.";
  }

  return message;
}

async function stopActiveLiveAvatarSession() {
  if (!activeLiveAvatarSession) {
    return;
  }

  const sessionToStop = activeLiveAvatarSession;
  activeLiveAvatarSession = null;

  activeLiveAvatarStopPromise = sessionToStop.stop().catch(() => {
    // Best effort cleanup.
  }).finally(() => {
    if (activeLiveAvatarStopPromise) {
      activeLiveAvatarStopPromise = null;
    }
  });

  await activeLiveAvatarStopPromise;
}

function attachSessionMedia(session: LiveAvatarSession, element: HTMLVideoElement | null) {
  if (!element) {
    return;
  }

  session.attach(element);

  void element.play().catch(() => {
    // Browser autoplay can be flaky; retry on next attach tick.
  });
}

export function HeyGenAvatarSession({
  sessionToken,
  avatar,
  agentName,
  speechRequest,
  interruptVersion,
  onReady,
  onSpeakingChange,
  onError,
  className = "",
}: HeyGenAvatarSessionProps) {
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const lastSpeechIdRef = useRef<string | null>(null);
  const lastInterruptVersionRef = useRef(0);
  const startedTokenRef = useRef<string | null>(null);
  const onReadyRef = useRef(onReady);
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  const onErrorRef = useRef(onError);
  const isConnectedRef = useRef(false);
  const pendingSpeechRef = useRef<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>(SessionState.INACTIVE);

  useEffect(() => {
    onReadyRef.current = onReady;
    onSpeakingChangeRef.current = onSpeakingChange;
    onErrorRef.current = onError;
  }, [onReady, onSpeakingChange, onError]);

  useEffect(() => {
    if (startedTokenRef.current === sessionToken) {
      return;
    }

    startedTokenRef.current = sessionToken;
    let cancelled = false;
    const session = new LiveAvatarSession(sessionToken, { voiceChat: false });
    sessionRef.current = session;

    const handleReady = () => {
      if (!mediaRef.current || cancelled) {
        return;
      }

      attachSessionMedia(session, mediaRef.current);
      onReadyRef.current?.();
    };

    const handleSpeakStarted = () => onSpeakingChangeRef.current?.(true);
    const handleSpeakEnded = () => onSpeakingChangeRef.current?.(false);
    const handleStateChanged = (nextState: SessionState) => {
      isConnectedRef.current = nextState === SessionState.CONNECTED;
      setSessionState(nextState);

      if (nextState === SessionState.CONNECTED && mediaRef.current) {
        attachSessionMedia(session, mediaRef.current);
      }

      if (nextState === SessionState.CONNECTED && pendingSpeechRef.current) {
        try {
          session.repeat(pendingSpeechRef.current);
          pendingSpeechRef.current = null;
        } catch (error) {
          onErrorRef.current?.(getReadableSessionError(error));
        }
      }
    };
    const handleDisconnected = (reason: SessionDisconnectReason) => {
      if (cancelled) {
        return;
      }

      onSpeakingChangeRef.current?.(false);
      if (reason !== SessionDisconnectReason.CLIENT_INITIATED) {
        onErrorRef.current?.("Se perdió la conexión con el avatar. La llamada continúa con la voz del agente.");
      }
    };

    session.on(SessionEvent.SESSION_STREAM_READY, handleReady);
    session.on(SessionEvent.SESSION_STATE_CHANGED, handleStateChanged);
    session.on(SessionEvent.SESSION_DISCONNECTED, handleDisconnected);
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, handleSpeakStarted);
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, handleSpeakEnded);

    void (async () => {
      try {
        if (activeLiveAvatarStopPromise) {
          await activeLiveAvatarStopPromise;
        }

        await stopActiveLiveAvatarSession();
        if (cancelled) {
          return;
        }

        activeLiveAvatarSession = session;
        await session.start();
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "HeyGen session failed";

        if (message.toLowerCase().includes("session concurrency limit reached")) {
          try {
            await stopActiveLiveAvatarSession();
            if (!cancelled) {
              activeLiveAvatarSession = session;
              await session.start();
              return;
            }
          } catch (retryError) {
            if (!cancelled) {
              onErrorRef.current?.(getReadableSessionError(retryError));
            }
            return;
          }
        }

        onErrorRef.current?.(getReadableSessionError(error));
      }
    })();

    const attachPollingInterval = window.setInterval(() => {
      if (cancelled || !mediaRef.current) {
        return;
      }

      if (session.state === SessionState.CONNECTED) {
        attachSessionMedia(session, mediaRef.current);
      }
    }, 750);

    return () => {
      cancelled = true;
      window.clearInterval(attachPollingInterval);
      isConnectedRef.current = false;
      pendingSpeechRef.current = null;
      session.off(SessionEvent.SESSION_STREAM_READY, handleReady);
      session.off(SessionEvent.SESSION_STATE_CHANGED, handleStateChanged);
      session.off(SessionEvent.SESSION_DISCONNECTED, handleDisconnected);
      session.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, handleSpeakStarted);
      session.off(AgentEventsEnum.AVATAR_SPEAK_ENDED, handleSpeakEnded);
      onSpeakingChangeRef.current?.(false);

      if (activeLiveAvatarSession === session) {
        activeLiveAvatarSession = null;
      }

      activeLiveAvatarStopPromise = session.stop().catch(() => {
        // Best effort cleanup.
      }).finally(() => {
        if (activeLiveAvatarStopPromise) {
          activeLiveAvatarStopPromise = null;
        }
      });

      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, [sessionToken]);

  useEffect(() => {
    if (!speechRequest || !speechRequest.text.trim()) {
      return;
    }

    if (lastSpeechIdRef.current === speechRequest.id) {
      return;
    }

    lastSpeechIdRef.current = speechRequest.id;

    if (!isConnectedRef.current) {
      pendingSpeechRef.current = speechRequest.text;
      return;
    }

    try {
      sessionRef.current?.repeat(speechRequest.text);
    } catch (error) {
      onErrorRef.current?.(getReadableSessionError(error));
    }
  }, [speechRequest]);

  useEffect(() => {
    if (interruptVersion === 0 || interruptVersion === lastInterruptVersionRef.current) {
      return;
    }

    lastInterruptVersionRef.current = interruptVersion;

    try {
      sessionRef.current?.interrupt();
    } catch (error) {
      onErrorRef.current?.(getReadableSessionError(error));
    }
  }, [interruptVersion]);

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-theme bg-slate-950 ${className}`.trim()}>
      <video
        ref={mediaRef}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
      />
      {sessionState !== SessionState.CONNECTED && (
        <div className="absolute inset-0">
          <AgentAvatarPreview avatar={avatar} name={agentName} className="h-full w-full" />
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/75 via-black/15 to-transparent p-6">
            <div>
              <p className="text-sm font-medium text-white">
                {sessionState === SessionState.CONNECTING ? "Conectando LiveAvatar..." : "Preparando avatar..."}
              </p>
              <p className="text-xs text-white/70">
                El video realtime aparecerá apenas la sesión quede lista.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
