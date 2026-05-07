"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { fetchWithAuth } from "@/lib/fetch-client";
import type { AgentAvatar } from "@/lib/schemas";

export interface RemoteRealtimeAvatarHandle {
  speakAudio: (audioBase64: string, format?: string) => Promise<void>;
  interrupt: () => Promise<void>;
  stop: () => Promise<void>;
}

interface RemoteRealtimeAvatarRendererProps {
  agentId: string;
  conversationId: string;
  onReady?: () => void;
  onError?: (error: string) => void;
}

type RemoteAvatarSession = {
  id: string;
  provider: AgentAvatar["provider"];
  mode: "remote";
  sessionToken: string;
  apiUrl?: string;
  avatarId?: string;
  sandboxMode?: boolean;
  externalSessionId?: string;
  sdk?: "liveavatar-web-sdk";
  metadata?: {
    apiUrl?: string;
    avatarId?: string;
    sandboxMode?: boolean;
  };
};

type LiveAvatarSessionInstance = import("@heygen/liveavatar-web-sdk").LiveAvatarSession;
type LiveAvatarSdk = typeof import("@heygen/liveavatar-web-sdk");

export const RemoteRealtimeAvatarRenderer = forwardRef<
  RemoteRealtimeAvatarHandle,
  RemoteRealtimeAvatarRendererProps
>(function RemoteRealtimeAvatarRenderer(
  { agentId, conversationId, onReady, onError },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sdkSessionRef = useRef<LiveAvatarSessionInstance | null>(null);
  const avatarSessionRef = useRef<RemoteAvatarSession | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState<"connecting" | "ready" | "speaking" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onError, onReady]);

  const attachStream = useCallback(() => {
    if (!videoRef.current || !sdkSessionRef.current) return;
    sdkSessionRef.current.attach(videoRef.current);
  }, []);

  const reportError = useCallback((message: string) => {
    setError(message);
    setStatus("error");
    onErrorRef.current?.(message);
  }, []);

  const flushAudioQueue = useCallback(async () => {
    if (!readyRef.current || !sdkSessionRef.current) return;

    while (audioQueueRef.current.length > 0) {
      const audio = audioQueueRef.current.shift();
      if (!audio) continue;
      await sdkSessionRef.current.repeatAudio(audio);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async speakAudio(audioBase64: string, format?: string) {
        if (format !== "pcm16") {
          console.warn(`[RemoteRealtimeAvatar] Ignoring unsupported audio format: ${format || "unknown"}`);
          return;
        }

        if (!readyRef.current || !sdkSessionRef.current) {
          audioQueueRef.current.push(audioBase64);
          return;
        }
        await sdkSessionRef.current.repeatAudio(audioBase64);
      },
      async interrupt() {
        audioQueueRef.current = [];
        try {
          await sdkSessionRef.current?.interrupt?.();
        } catch (error) {
          console.warn("[RemoteRealtimeAvatar] Interrupt ignored:", error);
        }
      },
      async stop() {
        audioQueueRef.current = [];
        const session = sdkSessionRef.current;
        const avatarSession = avatarSessionRef.current;
        sdkSessionRef.current = null;
        avatarSessionRef.current = null;
        readyRef.current = false;

        await Promise.allSettled([
          session?.stop?.(),
          avatarSession?.externalSessionId
            ? fetchWithAuth(
                `/api/avatar-sessions/${encodeURIComponent(avatarSession.externalSessionId)}?provider=liveavatar&reason=USER_CLOSED`,
                { method: "DELETE" }
              )
            : Promise.resolve(),
        ]);
      },
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

    async function startRemoteSession() {
      try {
        setStatus("connecting");
        setError(null);
        readyRef.current = false;
        audioQueueRef.current = [];

        const sessionRes = await fetchWithAuth("/api/avatar-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, conversationId }),
        });
        const sessionPayload = await sessionRes.json();
        if (!sessionRes.ok) {
          throw new Error(sessionPayload.error || "No se pudo iniciar el avatar remoto");
        }

        const avatarSession = sessionPayload.session as RemoteAvatarSession;
        if (!avatarSession.sessionToken) {
          throw new Error("La sesión remota no devolvió un token de reproducción");
        }
        avatarSessionRef.current = avatarSession;

        const sdk: LiveAvatarSdk = await import("@heygen/liveavatar-web-sdk");
        if (cancelled) {
          avatarSessionRef.current = null;
          return;
        }

        const sdkSession = new sdk.LiveAvatarSession(avatarSession.sessionToken, {
          voiceChat: false,
          apiUrl: avatarSession.apiUrl || avatarSession.metadata?.apiUrl,
        });
        sdkSessionRef.current = sdkSession;

        sdkSession.on(sdk.SessionEvent.SESSION_STATE_CHANGED, (nextState) => {
          if (cancelled) return;
          console.log("[RemoteRealtimeAvatar] Session state:", nextState);
        });

        sdkSession.on(sdk.SessionEvent.SESSION_STREAM_READY, () => {
          if (cancelled) return;
          attachStream();
          readyRef.current = true;
          setStatus("ready");
          onReadyRef.current?.();
          flushAudioQueue().catch((queueError) => {
            console.error("[RemoteRealtimeAvatar] Failed to flush audio queue:", queueError);
            reportError(queueError instanceof Error ? queueError.message : "No se pudo enviar audio al avatar remoto");
          });
        });

        sdkSession.on(sdk.SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED, (quality) => {
          console.log("[RemoteRealtimeAvatar] Connection quality:", quality);
        });

        sdkSession.on(sdk.AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
          if (!cancelled && readyRef.current) setStatus("speaking");
        });

        sdkSession.on(sdk.AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
          if (!cancelled && readyRef.current) setStatus("ready");
        });

        sdkSession.on(sdk.SessionEvent.SESSION_DISCONNECTED, (reason) => {
          if (cancelled) return;
          readyRef.current = false;
          setStatus("error");
          const message = reason
            ? `La sesión remota del avatar se desconectó: ${reason}`
            : "La sesión remota del avatar se desconectó";
          setError(message);
          onErrorRef.current?.(message);
        });

        await sdkSession.start();
        if (cancelled) {
          sdkSession.stop().catch(() => undefined);
          return;
        }
        attachStream();

        keepAliveTimer = setInterval(() => {
          if (!readyRef.current || !sdkSessionRef.current) return;
          sdkSessionRef.current.keepAlive().catch((keepAliveError) => {
            console.warn("[RemoteRealtimeAvatar] keepAlive failed:", keepAliveError);
          });
        }, 30000);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Error iniciando avatar remoto";
        reportError(message);
      }
    }

    startTimer = setTimeout(() => {
      startRemoteSession();
    }, 250);

    return () => {
      cancelled = true;
      if (startTimer) clearTimeout(startTimer);
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      readyRef.current = false;
      audioQueueRef.current = [];

      const session = sdkSessionRef.current;
      const avatarSession = avatarSessionRef.current;
      sdkSessionRef.current = null;
      session?.stop?.().catch(() => undefined);
      if (avatarSession?.externalSessionId) {
        fetchWithAuth(
          `/api/avatar-sessions/${encodeURIComponent(avatarSession.externalSessionId)}?provider=liveavatar&reason=USER_CLOSED`,
          { method: "DELETE" }
        ).catch(() => undefined);
      }

      avatarSessionRef.current = null;
    };
  }, [agentId, attachStream, conversationId, flushAudioQueue, reportError]);

  return (
    <div className="relative h-full w-full rounded-2xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
      />
      {(status === "connecting" || status === "error") && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center">
          <p className="text-sm text-white/70">
            {status === "connecting" ? "Conectando avatar remoto..." : error}
          </p>
        </div>
      )}
    </div>
  );
});
