"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  AgentEventsEnum,
  LiveAvatarSession,
  SessionEvent,
  VoiceChatEvent,
  VoiceChatState,
} from "@heygen/liveavatar-web-sdk";
import {
  endVoiceSession,
  startVoiceSession,
  type ApiVoiceSession,
  type VoiceSessionTranscriptEntry,
} from "../lib/api/avatar-api";
import { ApiClientError } from "../lib/api/http-client";
import { formatRetryAfter } from "../lib/avatar-sharing";

export type LiveAvatarSessionStatus = "idle" | "starting" | "active" | "ending" | "ended" | "error";

export type LiveAvatarConversationState = "idle" | "listening" | "thinking" | "speaking" | "interrupted";

export type LiveAvatarTranscriptEntry = VoiceSessionTranscriptEntry & {
  id: string;
};

export type LiveAvatarVoiceSession = Pick<
  ApiVoiceSession,
  "conversationId" | "realtimeSessionId" | "sessionToken" | "expiresAt"
>;

export type LiveAvatarDiagnostics = {
  voiceChatState: string;
  microphoneLevel: number | null;
  eventCount: number;
  lastEventType: string | null;
  lastElevenLabsEventType: string | null;
  elevenLabsConversationId: string | null;
  textProbeStatus: "idle" | "sending" | "sent" | "error";
  textProbeError: string | null;
};

export type LiveAvatarSessionState = {
  status: LiveAvatarSessionStatus;
  error: string | null;
  isMuted: boolean;
  isUserSpeaking: boolean;
  isAvatarSpeaking: boolean;
  conversationState: LiveAvatarConversationState;
  voiceSession: LiveAvatarVoiceSession | null;
  remainingSeconds: number | null;
  endedByLimit: boolean;
  transcript: LiveAvatarTranscriptEntry[];
  diagnostics: LiveAvatarDiagnostics;
};

export type UseLiveAvatarSessionOptions = {
  onEnded?: () => void | Promise<void>;
  onStarted?: (realtimeSessionId: string) => void | Promise<void>;
  startSession?: (sessionKey: string) => Promise<{ voiceSession: LiveAvatarVoiceSession }>;
  endSession?: (realtimeSessionId: string, transcript: VoiceSessionTranscriptEntry[]) => Promise<unknown>;
  endSessionOnUnload?: (realtimeSessionId: string, transcript: VoiceSessionTranscriptEntry[]) => void;
  formatStartError?: (error: unknown, fallback: (error: unknown) => string) => string;
};

const initialDiagnostics: LiveAvatarDiagnostics = {
  voiceChatState: "INACTIVE",
  microphoneLevel: null,
  eventCount: 0,
  lastEventType: null,
  lastElevenLabsEventType: null,
  elevenLabsConversationId: null,
  textProbeStatus: "idle",
  textProbeError: null,
};

const initialState: LiveAvatarSessionState = {
  status: "idle",
  error: null,
  isMuted: false,
  isUserSpeaking: false,
  isAvatarSpeaking: false,
  conversationState: "idle",
  voiceSession: null,
  remainingSeconds: null,
  endedByLimit: false,
  transcript: [],
  diagnostics: initialDiagnostics,
};

export function useLiveAvatarSession(avatarId: string, options: UseLiveAvatarSessionOptions = {}) {
  const [state, setState] = useState<LiveAvatarSessionState>(initialState);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  const voiceSessionRef = useRef<LiveAvatarVoiceSession | null>(null);
  const optionsRef = useRef(options);
  const transcriptRef = useRef<LiveAvatarTranscriptEntry[]>([]);
  const eventIdsRef = useRef(new Set<string>());
  const startingRef = useRef(false);
  const endingRef = useRef(false);
  const lifecycleActiveRef = useRef(true);
  const lifecycleEpochRef = useRef(0);
  const preservePendingEndOnTeardownRef = useRef(false);
  const diagnosticsCleanupRef = useRef<(() => void) | null>(null);
  const interruptionResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const closeCurrentSession = useCallback(async (options: { includeTranscript: boolean }) => {
    const currentSession = sessionRef.current;
    const currentVoiceSession = voiceSessionRef.current;

    cleanupDiagnostics(diagnosticsCleanupRef);
    clearInterruptionReset(interruptionResetTimeoutRef);
    sessionRef.current = null;

    const endRequest = currentVoiceSession
      ? (optionsRef.current.endSession ?? endVoiceSession)(
          currentVoiceSession.realtimeSessionId,
          options.includeTranscript
            ? transcriptRef.current.map(({ role, content, metadata }) => ({
                role,
                content,
                ...(metadata ? { metadata } : {}),
              }))
            : []
        )
      : null;
    if (currentSession) {
      void stopLiveAvatarSessionSafely(currentSession);
    }

    if (endRequest) {
      await endRequest;
      voiceSessionRef.current = null;
    }
  }, []);

  const closeCurrentSessionOnUnload = useCallback((preservePendingEnd?: boolean) => {
    const currentSession = sessionRef.current;
    const currentVoiceSession = voiceSessionRef.current;
    const endSessionOnUnload = optionsRef.current.endSessionOnUnload;
    const shouldPreservePendingEnd = preservePendingEnd ?? preservePendingEndOnTeardownRef.current;

    cleanupDiagnostics(diagnosticsCleanupRef);
    clearInterruptionReset(interruptionResetTimeoutRef);
    sessionRef.current = null;
    if (!shouldPreservePendingEnd) {
      voiceSessionRef.current = null;
    }

    if (currentVoiceSession && endSessionOnUnload) {
      try {
        endSessionOnUnload(
          currentVoiceSession.realtimeSessionId,
          transcriptRef.current.map(({ role, content }) => ({ role, content }))
        );
      } catch {
        // Page teardown cannot surface a recoverable error. A bfcache restore
        // keeps the pending YUNI session so the normal retry path can finish it.
      }
    }
    if (currentSession) {
      void stopLiveAvatarSessionSafely(currentSession);
    }
  }, []);

  const appendTranscript = useCallback((entry: LiveAvatarTranscriptEntry) => {
    if (eventIdsRef.current.has(entry.id)) {
      return;
    }

    eventIdsRef.current.add(entry.id);
    transcriptRef.current = [...transcriptRef.current, entry];
    setState((current) => ({ ...current, transcript: transcriptRef.current }));
  }, []);

  const attachMediaElement = useCallback((element: HTMLMediaElement | null) => {
    mediaElementRef.current = element;

    if (element && sessionRef.current) {
      sessionRef.current.attach(element);
    }
  }, []);

  const markInterrupted = useCallback(() => {
    clearInterruptionReset(interruptionResetTimeoutRef);
    setState((current) => ({
      ...current,
      error: null,
      conversationState: "interrupted",
      isAvatarSpeaking: false,
    }));
    interruptionResetTimeoutRef.current = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        conversationState: current.status === "active" ? "listening" : current.conversationState,
      }));
      interruptionResetTimeoutRef.current = null;
    }, 1400);
  }, []);

  const end = useCallback(async () => {
    const currentVoiceSession = voiceSessionRef.current;

    if (endingRef.current || !currentVoiceSession) {
      return;
    }

    endingRef.current = true;
    setState((current) => ({ ...current, status: "ending", error: null }));

    try {
      await closeCurrentSession({ includeTranscript: true });
      setState((current) => ({
        ...current,
        status: "ended",
        isUserSpeaking: false,
        isAvatarSpeaking: false,
        conversationState: "idle",
        voiceSession: null,
      }));
      void Promise.resolve(optionsRef.current.onEnded?.()).catch(() => undefined);
    } catch (error) {
      endingRef.current = false;
      setState((current) => ({
        ...current,
        status: "error",
        voiceSession: currentVoiceSession,
        error: formatVoiceSessionEndError(error),
      }));
    }
  }, [closeCurrentSession]);

  const start = useCallback(async () => {
    if (
      startingRef.current ||
      state.status === "starting" ||
      state.status === "active" ||
      voiceSessionRef.current
    ) {
      return;
    }

    startingRef.current = true;
    const lifecycleEpoch = lifecycleEpochRef.current;
    transcriptRef.current = [];
    eventIdsRef.current = new Set<string>();
    endingRef.current = false;
    setState({ ...initialState, status: "starting" });

    let liveAvatarSession: LiveAvatarSession | null = null;

    try {
      const { voiceSession } = await (optionsRef.current.startSession ?? startVoiceSession)(avatarId);
      // Keep the YUNI reservation before constructing the provider SDK so every
      // post-reservation failure can still close the server-side session.
      voiceSessionRef.current = voiceSession;
      if (
        !isLiveAvatarLifecycleCurrent(lifecycleActiveRef.current, lifecycleEpochRef.current, lifecycleEpoch)
      ) {
        endingRef.current = true;
        if (!lifecycleActiveRef.current && optionsRef.current.endSessionOnUnload) {
          closeCurrentSessionOnUnload();
        } else {
          endingRef.current = false;
          await end();
        }
        endingRef.current = false;
        return;
      }
      liveAvatarSession = new LiveAvatarSession(voiceSession.sessionToken, {
        voiceChat: { defaultMuted: false },
      });
      const session = liveAvatarSession;

      sessionRef.current = session;
      registerSessionEvents(session, {
        appendTranscript,
        attachCurrentMediaElement: () => {
          if (mediaElementRef.current) {
            session.attach(mediaElementRef.current);
          }
        },
        end,
        hasReachedExpiry: () => hasLiveAvatarSessionExpired(voiceSessionRef.current?.expiresAt),
        isCurrentSession: () => sessionRef.current === session,
        markInterrupted,
        setState,
      });

      await session.start();
      if (
        !isLiveAvatarLifecycleCurrent(
          lifecycleActiveRef.current,
          lifecycleEpochRef.current,
          lifecycleEpoch
        ) ||
        sessionRef.current !== session ||
        voiceSessionRef.current !== voiceSession
      )
        return;
      await ensureVoiceChatStarted(session);
      if (
        !isLiveAvatarLifecycleCurrent(
          lifecycleActiveRef.current,
          lifecycleEpochRef.current,
          lifecycleEpoch
        ) ||
        sessionRef.current !== session ||
        voiceSessionRef.current !== voiceSession
      )
        return;
      await optionsRef.current.onStarted?.(voiceSession.realtimeSessionId);
      if (
        !isLiveAvatarLifecycleCurrent(
          lifecycleActiveRef.current,
          lifecycleEpochRef.current,
          lifecycleEpoch
        ) ||
        sessionRef.current !== session ||
        voiceSessionRef.current !== voiceSession
      )
        return;
      diagnosticsCleanupRef.current = startMicrophoneLevelProbe(session, setState);

      setState((current) => ({
        ...current,
        status: "active",
        voiceSession,
        error: null,
        isMuted: session.voiceChat.isMuted,
        conversationState: "listening",
        diagnostics: {
          ...current.diagnostics,
          voiceChatState: String(session.voiceChat.state),
        },
      }));
    } catch (error) {
      if (liveAvatarSession && !sessionRef.current) {
        await stopLiveAvatarSessionSafely(liveAvatarSession);
      }

      let closeError: unknown = null;
      if (voiceSessionRef.current || sessionRef.current) {
        endingRef.current = true;
        try {
          await closeCurrentSession({ includeTranscript: false });
        } catch (error) {
          closeError = error;
        }
        endingRef.current = false;
      } else {
        cleanupDiagnostics(diagnosticsCleanupRef);
        clearInterruptionReset(interruptionResetTimeoutRef);
      }

      // A page can leave and return while provider startup is still settling.
      // If closing the already-reserved YUNI session then fails, keep the
      // recoverable pending-close state visible instead of swallowing it as a
      // stale startup result.
      if (closeError && lifecycleActiveRef.current && voiceSessionRef.current) {
        setState((current) => ({
          ...current,
          status: "error",
          conversationState: "idle",
          voiceSession: voiceSessionRef.current,
          error: formatVoiceSessionEndError(closeError),
        }));
        return;
      }

      if (
        !isLiveAvatarLifecycleCurrent(lifecycleActiveRef.current, lifecycleEpochRef.current, lifecycleEpoch)
      ) {
        return;
      }

      setState((current) => ({
        ...current,
        status: "error",
        conversationState: "idle",
        voiceSession: voiceSessionRef.current,
        error: optionsRef.current.formatStartError
          ? optionsRef.current.formatStartError(error, formatVoiceSessionStartError)
          : formatVoiceSessionStartError(error),
      }));
    } finally {
      startingRef.current = false;
    }
  }, [
    appendTranscript,
    avatarId,
    closeCurrentSession,
    closeCurrentSessionOnUnload,
    end,
    markInterrupted,
    state.status,
  ]);

  useEffect(() => {
    const expiresAt = state.voiceSession?.expiresAt;
    if (state.status !== "active" || !expiresAt) {
      if (state.status !== "ending") {
        setState((current) =>
          current.remainingSeconds === null ? current : { ...current, remainingSeconds: null }
        );
      }
      return;
    }

    const tick = () => {
      const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setState((current) => ({ ...current, remainingSeconds }));

      if (remainingSeconds === 0 && !endingRef.current) {
        setState((current) => ({ ...current, endedByLimit: true }));
        void end();
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [end, state.status, state.voiceSession?.expiresAt]);

  useEffect(() => {
    lifecycleActiveRef.current = true;

    const cleanup = (event?: PageTransitionEvent) => {
      const preservePendingEnd = event?.persisted === true;
      preservePendingEndOnTeardownRef.current = preservePendingEnd;
      lifecycleActiveRef.current = false;
      lifecycleEpochRef.current += 1;
      if (!sessionRef.current && !voiceSessionRef.current) {
        return;
      }

      if (endingRef.current) {
        if (voiceSessionRef.current && optionsRef.current.endSessionOnUnload) {
          closeCurrentSessionOnUnload(preservePendingEnd);
        }
        return;
      }

      endingRef.current = true;
      if (optionsRef.current.endSessionOnUnload) {
        closeCurrentSessionOnUnload(preservePendingEnd);
        return;
      }
      void closeCurrentSession({ includeTranscript: true })
        .catch(() => undefined)
        .finally(() => {
          endingRef.current = false;
        });
    };

    const restore = () => {
      lifecycleActiveRef.current = true;
      preservePendingEndOnTeardownRef.current = false;
      if (voiceSessionRef.current) {
        endingRef.current = false;
        void end();
        return;
      }
      endingRef.current = false;
      if (!sessionRef.current && !voiceSessionRef.current) {
        setState(recoverLiveAvatarStateAfterPageRestore);
      }
    };

    window.addEventListener("pagehide", cleanup);
    window.addEventListener("pageshow", restore);

    return () => {
      lifecycleActiveRef.current = false;
      window.removeEventListener("pagehide", cleanup);
      window.removeEventListener("pageshow", restore);
      cleanup();
    };
  }, [closeCurrentSession, closeCurrentSessionOnUnload, end]);

  const toggleMute = useCallback(async () => {
    const session = sessionRef.current;

    if (!session) {
      return;
    }

    try {
      await ensureVoiceChatStarted(session);

      if (session.voiceChat.isMuted) {
        await session.voiceChat.unmute();
      } else {
        await session.voiceChat.mute();
      }

      setState((current) => ({ ...current, isMuted: session.voiceChat.isMuted }));
    } catch {
      setState((current) => ({
        ...current,
        error: "No pudimos cambiar el estado del micrófono. Intentá nuevamente.",
      }));
    }
  }, []);

  const interrupt = useCallback(() => {
    const session = sessionRef.current;

    try {
      if (interruptActiveLiveAvatarSession(session, state.status)) {
        markInterrupted();
      }
    } catch {
      setState((current) => ({
        ...current,
        error: "No pudimos interrumpir al avatar. Intentá nuevamente.",
      }));
    }
  }, [markInterrupted, state.status]);

  const dismissError = useCallback(() => {
    setState(dismissLiveAvatarSessionError);
  }, []);

  const sendTextProbe = useCallback(async () => {
    const session = sessionRef.current;

    if (!session) {
      return;
    }

    setState((current) => ({
      ...current,
      diagnostics: {
        ...current.diagnostics,
        textProbeStatus: "sending",
        textProbeError: null,
      },
    }));

    try {
      await sendElevenLabsUserMessage(session, "Hola, podes responderme con una frase corta?");
      setState((current) => ({
        ...current,
        diagnostics: {
          ...current.diagnostics,
          textProbeStatus: "sent",
          textProbeError: null,
        },
      }));
    } catch {
      setState((current) => ({
        ...current,
        diagnostics: {
          ...current.diagnostics,
          textProbeStatus: "error",
          textProbeError: "No pudimos enviar el mensaje de prueba.",
        },
      }));
    }
  }, []);

  return {
    ...state,
    hasPendingEnd: hasPendingLiveAvatarEnd(state),
    attachMediaElement,
    start,
    end,
    toggleMute,
    interrupt,
    dismissError,
    sendTextProbe,
  };
}

export function hasPendingLiveAvatarEnd(state: Pick<LiveAvatarSessionState, "status" | "voiceSession">) {
  return state.status === "error" && state.voiceSession !== null;
}

export function dismissLiveAvatarSessionError(state: LiveAvatarSessionState): LiveAvatarSessionState {
  return {
    ...state,
    status: state.status === "error" && !hasPendingLiveAvatarEnd(state) ? "idle" : state.status,
    error: null,
  };
}

export function recoverLiveAvatarStateAfterPageRestore(
  state: LiveAvatarSessionState
): LiveAvatarSessionState {
  const wasInFlight = (["starting", "active", "ending"] as LiveAvatarSessionStatus[]).includes(state.status);
  if (!wasInFlight && !(state.status === "error" && state.voiceSession)) {
    return state;
  }

  return {
    ...state,
    status: "ended",
    error: null,
    voiceSession: null,
    remainingSeconds: null,
    isMuted: false,
    isUserSpeaking: false,
    isAvatarSpeaking: false,
    conversationState: "idle",
  };
}

export function interruptActiveLiveAvatarSession(
  session: Pick<LiveAvatarSession, "interrupt"> | null,
  status: LiveAvatarSessionStatus
) {
  if (!session || status !== "active") {
    return false;
  }

  session.interrupt();
  return true;
}

async function stopLiveAvatarSessionSafely(session: Pick<LiveAvatarSession, "stop">) {
  try {
    await session.stop();
  } catch {
    // The server owns the durable/idempotent provider cleanup path.
  }
}

type RegisterSessionEventsOptions = {
  appendTranscript: (entry: LiveAvatarTranscriptEntry) => void;
  attachCurrentMediaElement: () => void;
  end: () => Promise<void>;
  hasReachedExpiry: () => boolean;
  isCurrentSession: () => boolean;
  markInterrupted: () => void;
  setState: Dispatch<SetStateAction<LiveAvatarSessionState>>;
};

function registerSessionEvents(session: LiveAvatarSession, options: RegisterSessionEventsOptions) {
  session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (voiceChatState) => {
    if (!options.isCurrentSession()) return;
    options.setState((current) => ({
      ...current,
      isMuted: voiceChatState !== VoiceChatState.ACTIVE || session.voiceChat.isMuted,
      diagnostics: {
        ...current.diagnostics,
        voiceChatState,
      },
    }));
  });

  session.voiceChat.on(VoiceChatEvent.MUTED, () => {
    if (!options.isCurrentSession()) return;
    options.setState((current) => ({ ...current, isMuted: true }));
  });

  session.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
    if (!options.isCurrentSession()) return;
    options.setState((current) => ({ ...current, isMuted: false }));
  });

  session.on(SessionEvent.SESSION_STREAM_READY, () => {
    if (!options.isCurrentSession()) return;
    markEvent(options, SessionEvent.SESSION_STREAM_READY);
    options.attachCurrentMediaElement();
  });

  session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
    if (!options.isCurrentSession()) return;
    markEvent(options, AgentEventsEnum.USER_SPEAK_STARTED);
    options.setState((current) => ({ ...current, isUserSpeaking: true, conversationState: "listening" }));
  });

  session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
    if (!options.isCurrentSession()) return;
    markEvent(options, AgentEventsEnum.USER_SPEAK_ENDED);
    options.setState((current) => ({ ...current, isUserSpeaking: false, conversationState: "thinking" }));
  });

  session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
    if (!options.isCurrentSession()) return;
    markEvent(options, AgentEventsEnum.AVATAR_SPEAK_STARTED);
    options.setState((current) => ({ ...current, isAvatarSpeaking: true, conversationState: "speaking" }));
  });

  session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
    if (!options.isCurrentSession()) return;
    markEvent(options, AgentEventsEnum.AVATAR_SPEAK_ENDED);
    options.setState((current) => ({ ...current, isAvatarSpeaking: false, conversationState: "listening" }));
  });

  session.on(AgentEventsEnum.USER_TRANSCRIPTION, (event) => {
    if (!options.isCurrentSession()) return;
    markEvent(options, event.event_type);
    options.appendTranscript({
      id: event.event_id,
      role: "user",
      content: event.text,
      metadata: { liveAvatarEventType: event.event_type },
    });
  });

  session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (event) => {
    if (!options.isCurrentSession()) return;
    markEvent(options, event.event_type);
    options.appendTranscript({
      id: event.event_id,
      role: "assistant",
      content: event.text,
      metadata: { liveAvatarEventType: event.event_type },
    });
  });

  session.on(AgentEventsEnum.ELEVENLABS_AGENT_EVENT, (event) => {
    if (!options.isCurrentSession()) return;
    markEvent(options, event.event_type, {
      lastElevenLabsEventType: event.elevenlabs_event_type,
      elevenLabsConversationId: readElevenLabsConversationId(event.data),
    });

    if (event.elevenlabs_event_type === "interruption") {
      options.markInterrupted();
      void sendElevenLabsContextualUpdate(
        session,
        "El usuario interrumpio mientras el avatar hablaba. En el proximo turno, prioriza el nuevo pedido y no repitas la respuesta anterior."
      ).catch(() => undefined);
    }
  });

  session.on(AgentEventsEnum.SESSION_STOPPED, (event) => {
    if (!options.isCurrentSession()) return;
    markEvent(options, event.event_type);
    if (options.hasReachedExpiry()) {
      options.setState((current) => ({ ...current, endedByLimit: true }));
    }
    void options.end();
  });
}

export function hasLiveAvatarSessionExpired(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return false;
  const deadline = new Date(expiresAt).getTime();
  return Number.isFinite(deadline) && deadline <= now;
}

export function isLiveAvatarLifecycleCurrent(active: boolean, currentEpoch: number, capturedEpoch: number) {
  return active && currentEpoch === capturedEpoch;
}

function markEvent(
  options: RegisterSessionEventsOptions,
  eventType: string,
  diagnostics: Partial<
    Pick<LiveAvatarDiagnostics, "lastElevenLabsEventType" | "elevenLabsConversationId">
  > = {}
) {
  options.setState((current) => ({
    ...current,
    diagnostics: {
      ...current.diagnostics,
      eventCount: current.diagnostics.eventCount + 1,
      lastEventType: eventType,
      lastElevenLabsEventType:
        diagnostics.lastElevenLabsEventType ?? current.diagnostics.lastElevenLabsEventType,
      elevenLabsConversationId:
        diagnostics.elevenLabsConversationId ?? current.diagnostics.elevenLabsConversationId,
    },
  }));
}

async function ensureVoiceChatStarted(session: LiveAvatarSession) {
  if (isVoiceChatActive(session)) {
    return;
  }

  try {
    await session.voiceChat.start({ defaultMuted: false });
  } catch (error) {
    throw new VoiceChatStartError(formatVoiceSessionStartError(error));
  }

  if (!isVoiceChatActive(session)) {
    throw new VoiceChatStartError(
      "El avatar esta conectado, pero el microfono no quedo activo. Revisa permisos del navegador y vuelve a iniciar la llamada."
    );
  }
}

function isVoiceChatActive(session: LiveAvatarSession) {
  return (session.voiceChat.state as VoiceChatState) === VoiceChatState.ACTIVE;
}

function startMicrophoneLevelProbe(
  session: LiveAvatarSession,
  setState: Dispatch<SetStateAction<LiveAvatarSessionState>>
) {
  try {
    return createMicrophoneLevelProbe(session, setState);
  } catch {
    // Diagnostics are best-effort and must never tear down a healthy call.
    return () => undefined;
  }
}

function createMicrophoneLevelProbe(
  session: LiveAvatarSession,
  setState: Dispatch<SetStateAction<LiveAvatarSessionState>>
) {
  const track = readVoiceChatMediaStreamTrack(session);
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!track || !AudioContextConstructor) {
    return () => undefined;
  }

  const audioContext = new AudioContextConstructor();
  const stream = new MediaStream([track]);
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  const samples = new Uint8Array(analyser.fftSize);

  source.connect(analyser);
  void audioContext.resume().catch(() => undefined);

  const intervalId = window.setInterval(() => {
    try {
      analyser.getByteTimeDomainData(samples);
      let total = 0;

      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        total += normalized * normalized;
      }

      const microphoneLevel = Math.sqrt(total / samples.length);
      setState((current) => ({
        ...current,
        diagnostics: {
          ...current.diagnostics,
          microphoneLevel,
          voiceChatState: String(session.voiceChat.state),
        },
      }));
    } catch {
      window.clearInterval(intervalId);
    }
  }, 250);

  return () => {
    window.clearInterval(intervalId);
    source.disconnect();
    void audioContext.close().catch(() => undefined);
  };
}

function cleanupDiagnostics(ref: { current: (() => void) | null }) {
  ref.current?.();
  ref.current = null;
}

function clearInterruptionReset(ref: { current: number | null }) {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

function readVoiceChatMediaStreamTrack(session: LiveAvatarSession): MediaStreamTrack | null {
  const voiceChat = session.voiceChat as unknown as {
    track?: { mediaStreamTrack?: MediaStreamTrack } | MediaStreamTrack | null;
  };
  const track = voiceChat.track;

  if (!track) {
    return null;
  }

  if (typeof MediaStreamTrack !== "undefined" && track instanceof MediaStreamTrack) {
    return track;
  }

  return "mediaStreamTrack" in track ? (track.mediaStreamTrack ?? null) : null;
}

async function sendElevenLabsUserMessage(session: LiveAvatarSession, text: string) {
  await sendElevenLabsCommand(session, "user_message", { text });
}

async function sendElevenLabsContextualUpdate(session: LiveAvatarSession, text: string) {
  await sendElevenLabsCommand(session, "contextual_update", { text });
}

async function sendElevenLabsCommand(
  session: LiveAvatarSession,
  elevenlabsEventType: "user_message" | "contextual_update",
  data: Record<string, string>
) {
  const room = (
    session as unknown as {
      room?: {
        localParticipant?: {
          publishData?: (
            data: Uint8Array,
            options: { reliable: boolean; topic: string }
          ) => Promise<void> | void;
        };
      };
    }
  ).room;
  const publishData = room?.localParticipant?.publishData;

  if (!publishData) {
    throw new Error("No pudimos acceder al canal de comandos de LiveAvatar.");
  }

  const payload = {
    event_type: "elevenlabs_agent_command",
    elevenlabs_event_type: elevenlabsEventType,
    data,
  };

  await publishData.call(room.localParticipant, new TextEncoder().encode(JSON.stringify(payload)), {
    reliable: true,
    topic: "agent-control",
  });
}

function readElevenLabsConversationId(data: Record<string, unknown>): string | null {
  const event = readRecord(data.conversation_initiation_metadata_event);

  return readString(event?.conversation_id) ?? readString(data.conversation_id);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function formatVoiceSessionStartError(error: unknown): string {
  if (error instanceof VoiceChatStartError) {
    return error.message;
  }

  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "El navegador bloqueo el microfono. Habilita permisos de microfono para localhost y vuelve a iniciar la llamada.";
  }

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No encontramos un microfono disponible. Conecta o selecciona un microfono y vuelve a iniciar la llamada.";
  }

  if (error instanceof ApiClientError && error.reason === "AVATAR_NOT_READY") {
    return "Este avatar todavía no está disponible para interactuar. Avisale al creador.";
  }

  if (error instanceof ApiClientError) {
    const retry = formatRetryAfter(error.retryAfterSeconds);
    if (error.reason === "SHARE_SESSION_COUNT_LIMIT") {
      return "Ya alcanzaste la cantidad de llamadas permitidas.";
    }
    if (error.reason === "PLATFORM_RATE_LIMIT") {
      return `Se hicieron demasiados intentos. Volvé a intentar en ${retry}.`;
    }
    if (error.reason === "EXTERNAL_SESSION_CAPACITY") {
      return `El avatar alcanzó su capacidad de llamadas. Volvé a intentar en ${retry}.`;
    }
    if (error.reason === "ACTIVE_SESSION_EXISTS") {
      return "Ya hay una llamada activa para este acceso. Finalizala antes de iniciar otra.";
    }
  }

  if (error instanceof ApiClientError && error.status === 404) {
    return "Ya no tenés acceso a este avatar. Volvé a Mis avatares para actualizar la lista.";
  }

  return "No pudimos conectar la llamada. Intentá nuevamente.";
}

export function formatVoiceSessionEndError(_error: unknown): string {
  return "No pudimos guardar la llamada. Reintentá el guardado.";
}

class VoiceChatStartError extends Error {}
